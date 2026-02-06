// clean-server.js - Simple working server
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Test endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Clean server is running',
    time: new Date().toISOString() 
  });
});

// Simple registration - NO DATABASE
app.post('/api/auth/patient-register', (req, res) => {
  console.log('\n🔵 REGISTRATION REQUEST');
  console.log('Body:', req.body);
  
  try {
    const { firstName, lastName, email, password, confirmPassword, dateOfBirth } = req.body;
    
    // Basic validation
    if (!firstName || !lastName || !email || !password || !dateOfBirth) {
      return res.status(400).json({ 
        success: false, 
        error: 'All fields are required' 
      });
    }
    
    if (password !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Passwords do not match' 
      });
    }
    
    // Mock user creation
    const mockUser = {
      id: Date.now(),
      firstName,
      lastName,
      email,
      dateOfBirth,
      mrn: `MRN-${Date.now().toString().slice(-6)}`
    };
    
    // Mock token
    const token = jwt.sign(
      { id: mockUser.id, email: mockUser.email, type: 'patient' },
      'test-secret-123',
      { expiresIn: '24h' }
    );
    
    console.log('✅ Mock registration successful for:', email);
    
    return res.json({
      success: true,
      message: 'Registration successful (mock)',
      patient: mockUser,
      token: token
    });
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Serve static files if needed
app.use(express.static('../frontend'));

const PORT = 3001; // Use different port
app.listen(PORT, () => {
  console.log(`✅ CLEAN SERVER running on http://localhost:${PORT}`);
  console.log(`📡 Test: curl http://localhost:${PORT}/api/health`);
  console.log(`📡 Test registration endpoint is ready`);
});