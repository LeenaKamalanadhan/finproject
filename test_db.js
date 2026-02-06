const { pool } = require('./src/config/database');

async function testMinimalRegistration() {
  const client = await pool.connect();
  
  try {
    // Get staff ID
    const staffResult = await client.query("SELECT staff_id FROM staff LIMIT 1");
    const createdBy = staffResult.rows[0]?.staff_id;
    
    if (!createdBy) {
      console.log('No staff found! Creating one...');
      await client.query(`
        INSERT INTO staff (staff_id, employee_id, first_name, last_name, email, hospital_id, role)
        VALUES (gen_random_uuid(), 'EMP001', 'Admin', 'User', 'admin@hospital.com', 'HOSP001', 'Admin')
      `);
      const newStaff = await client.query("SELECT staff_id FROM staff LIMIT 1");
      createdBy = newStaff.rows[0].staff_id;
    }
    
    // Generate MRN
    const mrn = `MRN-TEST-${Date.now()}`;
    
    // Test data - MINIMAL
    const testData = {
      mrn,
      first_name: 'Minimal',
      last_name: 'Test',
      email: `minimal${Date.now()}@test.com`,
      password_hash: '$2a$10$testhash',
      date_of_birth: '1990-01-01',
      patient_status: 'Active',
      created_by: createdBy
    };
    
    console.log('Testing with minimal data:', testData.email);
    
    // Minimal query
    const query = `
      INSERT INTO patients (
        mrn, first_name, last_name, email, 
        password_hash, date_of_birth, 
        patient_status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING patient_id, email
    `;
    
    const params = [
      testData.mrn,
      testData.first_name,
      testData.last_name,
      testData.email,
      testData.password_hash,
      testData.date_of_birth,
      testData.patient_status,
      testData.created_by
    ];
    
    console.log('Params:', params);
    
    const result = await client.query(query, params);
    console.log('✅ SUCCESS! Patient ID:', result.rows[0].patient_id);
    
    // Clean up
    await client.query('DELETE FROM patients WHERE email = $1', [testData.email]);
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('Detail:', error.detail);
    console.error('Hint:', error.hint);
  } finally {
    client.release();
    process.exit();
  }
}

testMinimalRegistration();