// server.js - COMPLETE VERSION (CORRECTED)
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { query, pool: dbPool, testConnection } = require('./src/config/database');

const app = express();

// Middleware
app.use(cors({
  origin: true, // Allow all origins in development
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from frontend/public
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Test database connection
testConnection().then(connected => {
  if (connected) {
    console.log('✅ Database initialized successfully');
  } else {
    console.log('⚠️  Using in-memory storage due to database connection failure');
  }
});

// Constants
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this_in_production';
const OTP_TTL_MS = Number(process.env.OTP_TTL_MS) || 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS) || 5;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const otpStore = new Map();

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ==================== DATABASE HELPER FUNCTIONS ====================

async function findUserById(identifier) {
  try {
    const query = `
      SELECT staff_id, employee_id, first_name, last_name, email, 
             password_hash, hospital_id, role, department, employment_status
      FROM staff 
      WHERE (staff_id = $1 OR email = $1) AND employment_status = 'Active'
    `;
    const result = await dbPool.query(query, [identifier]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Database error in findUserById:', error);
    return null;
  }
}

async function findPatientById(identifier) {
  try {
    const query = `
      SELECT 
        patient_id, 
        mrn, 
        first_name, 
        last_name, 
        email, 
        phone, 
        password_hash, 
        date_of_birth, 
        patient_status,
        gender,
        blood_type,
        address_line1,
        city,
        state,
        zip_code,
        emergency_contact_name, 
        emergency_contact_phone,
        emergency_contact_relationship
      FROM patients 
      WHERE email = $1 OR patient_id::text = $1
    `;
    const result = await dbPool.query(query, [identifier]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Database error in findPatientById:', error);
    return null;
  }
}

// ==================== AUTHENTICATION MIDDLEWARE ====================

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false,
      error: 'Access token required' 
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ 
        success: false,
        error: 'Invalid or expired token' 
      });
    }
    req.user = user;
    next();
  });
}

// ==================== ROUTES ====================

// Health Check
app.get('/api/health', async (req, res) => {
  try {
    const dbResult = await dbPool.query('SELECT NOW() as time');
    
    res.json({
      success: true,
      message: 'Server is running',
      timestamp: new Date().toISOString(),
      database: 'Connected',
      dbTime: dbResult.rows[0].time
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// Test Database Connection
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await dbPool.query('SELECT NOW() as current_time');
    res.json({
      success: true,
      message: 'Database connected successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// Staff Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { staff_id, password, hospital_id } = req.body || {};

    if (!staff_id || !password || !hospital_id) {
      return res.status(400).json({ 
        success: false,
        error: 'staff_id, password and hospital_id are required' 
      });
    }

    const user = await findUserById(staff_id);
    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials' 
      });
    }

    if (!user.password_hash) {
      return res.status(500).json({ 
        success: false,
        error: 'User password not set. Contact admin.' 
      });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials' 
      });
    }

    if (user.hospital_id !== hospital_id) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials' 
      });
    }

    const token = jwt.sign(
      {
        staff_id: user.staff_id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        role: user.role,
        type: 'staff'
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.json({
      success: true,
      token,
      staff: {
        staff_id: user.staff_id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        role: user.role,
        department: user.department
      }
    });

  } catch (error) {
    console.error('Staff login error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Patient Registration - WORKING VERSION
app.post('/api/auth/patient-register', async (req, res) => {
  console.log('\n══════════════════════════════════════════════════');
  console.log('🆕 REGISTRATION REQUEST RECEIVED');
  console.log('══════════════════════════════════════════════════\n');
  console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { 
      firstName, 
      lastName, 
      email, 
      phone, 
      password, 
      confirmPassword,
      dateOfBirth,
      gender,
      bloodType,
      address_line1,
      city,
      state,
      zip_code
    } = req.body;

    console.log('🔍 Parsed data:', {
      firstName: firstName || '(empty)',
      lastName: lastName || '(empty)',
      email: email || '(empty)',
      phone: phone || '(null)',
      passwordLength: password ? password.length : 0,
      confirmPasswordLength: confirmPassword ? confirmPassword.length : 0,
      dateOfBirth: dateOfBirth || '(empty)'
    });

    // Validation
    console.log('✅ Starting validation...');
    if (!firstName || !lastName || !email || !password || !dateOfBirth) {
      console.log('❌ Validation failed - missing required fields');
      return res.status(400).json({ 
        success: false,
        error: 'First name, last name, email, password, and date of birth are required' 
      });
    }

    if (password.length < 8) {
      console.log('❌ Validation failed - password too short');
      return res.status(400).json({ 
        success: false,
        error: 'Password must be at least 8 characters' 
      });
    }

    // Check password confirmation
    if (password !== confirmPassword) {
      console.log('❌ Validation failed - passwords do not match');
      return res.status(400).json({ 
        success: false,
        error: 'Passwords do not match' 
      });
    }

    console.log('📧 Checking if email exists...');
    const existingPatient = await findPatientById(email);
    if (existingPatient) {
      console.log('❌ Email already exists:', email);
      return res.status(409).json({ 
        success: false,
        error: 'Email already registered. Please use a different email or try signing in.' 
      });
    }
    console.log('✅ Email is available');

    console.log('🔐 Hashing password...');
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    console.log('✅ Password hashed');

    console.log('🏷️ Generating MRN...');
    const mrnQuery = await dbPool.query(
      "SELECT COUNT(*) as count FROM patients WHERE EXTRACT(YEAR FROM registered_date) = EXTRACT(YEAR FROM CURRENT_DATE)"
    );
    const year = new Date().getFullYear().toString().slice(-2);
    const count = parseInt(mrnQuery.rows[0].count) + 1;
    const mrn = `MRN-${year}${String(count).padStart(4, '0')}`;
    console.log('✅ Generated MRN:', mrn);

    console.log('👨‍⚕️ Getting staff ID for created_by...');
    const defaultStaff = await dbPool.query(
      "SELECT staff_id FROM staff WHERE role = 'Admin' LIMIT 1"
    );
    const createdBy = defaultStaff.rows[0]?.staff_id || '566fe8af-f254-4cb6-8063-0da4df4a9611';
    console.log('✅ Using created_by:', createdBy);

    console.log('📝 Building INSERT query...');
    const insertQuery = `
      INSERT INTO patients (
        mrn, 
        first_name, 
        last_name, 
        email, 
        phone, 
        password_hash, 
        date_of_birth, 
        gender, 
        blood_type,
        address_line1,
        city,
        state,
        zip_code,
        patient_status, 
        registered_date, 
        created_by,
        consent_for_treatment,
        consent_for_data_share
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_DATE, $15, true, true)
      RETURNING 
        patient_id, 
        mrn, 
        first_name, 
        last_name, 
        email, 
        phone, 
        date_of_birth, 
        gender, 
        blood_type,
        address_line1,
        city,
        state,
        zip_code,
        patient_status,
        registered_date
    `;

    const params = [
      mrn, 
      firstName, 
      lastName, 
      email.toLowerCase(), 
      phone || null,
      passwordHash, 
      dateOfBirth,
      gender || 'Unknown',
      bloodType || null,
      address_line1 || null,
      city || null,
      state || null,
      zip_code || null,
      'Active',
      createdBy||null
    ];

    console.log('🗄️ Parameters:', params);
    console.log('🚀 Executing INSERT query...');

    const result = await dbPool.query(insertQuery, params);
    
    console.log('✅ INSERT successful!');
    const newPatient = result.rows[0];
    console.log('📄 Patient created with ID:', newPatient.patient_id);

    console.log('🔑 Generating JWT token...');
    const token = jwt.sign(
      { 
        patient_id: newPatient.patient_id,
        mrn: newPatient.mrn,
        email: newPatient.email,
        name: `${newPatient.first_name} ${newPatient.last_name}`,
        type: 'patient'
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('✅ Token generated');
    console.log('\n🎉 REGISTRATION SUCCESSFUL for:', email);
    console.log('══════════════════════════════════════════════════\n');

    return res.status(201).json({
      success: true,
      message: 'Patient account created successfully',
      patient: newPatient,
      token: token
    });

  } catch (error) {
    console.error('\n❌❌❌ REGISTRATION ERROR:');
    console.error('   Message:', error.message);
    console.error('   Code:', error.code);
    console.error('   Detail:', error.detail);
    console.error('   Hint:', error.hint);
    console.error('   Position:', error.position);
    console.error('   Stack:', error.stack);
    console.error('══════════════════════════════════════════════════\n');
    
    return res.status(500).json({ 
      success: false,
      error: 'Server error during registration',
      details: error.message,
      code: error.code,
      hint: error.hint
    });
  }
});

// Patient Login
app.post('/api/auth/patient-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Email and password are required' 
      });
    }

    const patient = await findPatientById(email);
    if (!patient || patient.patient_status !== 'Active') {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }

    const passwordValid = await bcrypt.compare(password, patient.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }

    const token = jwt.sign(
      { 
        patient_id: patient.patient_id,
        mrn: patient.mrn,
        email: patient.email,
        name: `${patient.first_name} ${patient.last_name}`,
        type: 'patient'
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const { password_hash, ...patientData } = patient;

    return res.json({
      success: true,
      message: 'Login successful',
      token: token,
      patient: patientData
    });

  } catch (error) {
    console.error('Patient login error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Server error during login',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Verify Token
app.post('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// Get Patient Profile
app.get('/api/auth/patient-profile', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'patient') {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. Patient only.' 
      });
    }

    const patient = await findPatientById(req.user.patient_id);
    if (!patient) {
      return res.status(404).json({ 
        success: false,
        error: 'Patient not found' 
      });
    }

    const { password_hash, ...patientData } = patient;
    
    return res.json({
      success: true,
      patient: patientData
    });

  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
// Patient Dashboard Endpoint
app.get('/api/patient/dashboard', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'patient') {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. Patient only.' 
      });
    }

    const patientId = req.user.patient_id;
    
    // Get patient info
    const patientResult = await dbPool.query(
      `SELECT patient_id, mrn, first_name, last_name, email, phone, 
              date_of_birth, gender, blood_type, patient_status
       FROM patients WHERE patient_id = $1`,
      [patientId]
    );
    
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Patient not found' 
      });
    }
    
    const patient = patientResult.rows[0];
    patient.name = `${patient.first_name} ${patient.last_name}`;
    
    // Get counts for dashboard stats
    const [appointmentsCount, prescriptionsCount, reportsCount] = await Promise.all([
      // Upcoming appointments
      dbPool.query(
        `SELECT COUNT(*) FROM appointments 
         WHERE patient_id = $1 
         AND appointment_status = 'Scheduled'`,
        [patientId]
      ),
      // Active prescriptions
      dbPool.query(
        `SELECT COUNT(*) FROM prescriptions 
         WHERE patient_id = $1 
         AND status = 'Active'`,
        [patientId]
      ),
      // Medical reports
      dbPool.query(
        `SELECT COUNT(*) FROM patient_documents 
         WHERE patient_id = $1`,
        [patientId]
      )
    ]);
    
    // Get next appointment
    const nextAppointment = await dbPool.query(
      `SELECT * FROM appointments 
       WHERE patient_id = $1 
       AND appointment_status = 'Scheduled'
       ORDER BY scheduled_date ASC 
       LIMIT 1`,
      [patientId]
    );
    
    // Get recent activity
    const recentActivity = await dbPool.query(
      `SELECT * FROM patient_activity_log 
       WHERE patient_id = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [patientId]
    );
    
    return res.json({
      success: true,
      data: {
        patient: patient,
        stats: {
          upcomingAppointments: parseInt(appointmentsCount.rows[0]?.count || 0),
          activePrescriptions: parseInt(prescriptionsCount.rows[0]?.count || 0),
          medicalReports: parseInt(reportsCount.rows[0]?.count || 0),
          unreadMessages: 0
        },
        nextAppointment: nextAppointment.rows[0] || null,
        recentActivity: recentActivity.rows || []
      }
    });
    
  } catch (error) {
    console.error('Dashboard error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Server error' 
    });
  }
});
// Update Patient Profile - CORRECTED VERSION
app.put('/api/patient/profile', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'patient') {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. Patient only.' 
      });
    }

    const patientId = req.user.patient_id;
    const { 
      phone, 
      address_line1, 
      city, 
      state, 
      zip_code,
      emergency_contact_name,
      emergency_contact_phone,
      emergency_contact_relationship
    } = req.body;

    // Build update query dynamically
    const updates = [];
    const values = [];
    let index = 1;

    if (phone !== undefined) {
      updates.push(`phone = $${index++}`);
      values.push(phone);
    }
    if (address_line1 !== undefined) {
      updates.push(`address_line1 = $${index++}`);
      values.push(address_line1);
    }
    if (city !== undefined) {
      updates.push(`city = $${index++}`);
      values.push(city);
    }
    if (state !== undefined) {
      updates.push(`state = $${index++}`);
      values.push(state);
    }
    if (zip_code !== undefined) {
      updates.push(`zip_code = $${index++}`);
      values.push(zip_code);
    }
    if (emergency_contact_name !== undefined) {
      updates.push(`emergency_contact_name = $${index++}`);
      values.push(emergency_contact_name);
    }
    if (emergency_contact_phone !== undefined) {
      updates.push(`emergency_contact_phone = $${index++}`);
      values.push(emergency_contact_phone);
    }
    if (emergency_contact_relationship !== undefined) {
      updates.push(`emergency_contact_relationship = $${index++}`);
      values.push(emergency_contact_relationship);
    }

    if (updates.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'No valid fields to update' 
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    
    const query = `
      UPDATE patients 
      SET ${updates.join(', ')}
      WHERE patient_id = $${index}
      RETURNING patient_id, first_name, last_name, email, phone,
                address_line1, city, state, zip_code,
                emergency_contact_name, emergency_contact_phone, 
                emergency_contact_relationship
    `;
    
    values.push(patientId);

    const result = await dbPool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Patient not found' 
      });
    }

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      patient: result.rows[0]
    });

  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Error updating profile',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update Patient Password
app.put('/api/patient/update-password', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'patient') {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. Patient only.' 
      });
    }

    const patientId = req.user.patient_id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ 
        success: false,
        error: 'All password fields are required' 
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ 
        success: false,
        error: 'New passwords do not match' 
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ 
        success: false,
        error: 'New password must be at least 8 characters' 
      });
    }

    const patient = await findPatientById(patientId);
    if (!patient) {
      return res.status(404).json({ 
        success: false,
        error: 'Patient not found' 
      });
    }

    const passwordValid = await bcrypt.compare(currentPassword, patient.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ 
        success: false,
        error: 'Current password is incorrect' 
      });
    }

    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    const updateQuery = `
      UPDATE patients 
      SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
      WHERE patient_id = $2
    `;

    await dbPool.query(updateQuery, [newPasswordHash, patientId]);

    return res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Update password error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Error updating password',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==================== SERVER STARTUP ====================

// Serve frontend for any other route (SPA support)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📁 Uploads directory: ${UPLOADS_DIR}`);
  console.log(`🔒 JWT secret loaded: ${JWT_SECRET ? 'Yes' : 'No'}`);
});