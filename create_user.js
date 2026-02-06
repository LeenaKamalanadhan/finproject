// create_user.js (improved)
// Usage (either):
// 1) node create_user.js STAFF001 "John Doe" HOSP1001 john@example.com +919876543210 MyPass123
// 2) node create_user.js STAFF001 John Doe HOSP1001 john@example.com +919876543210 MyPass123
//    (the script will join the middle args into the name automatically)

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const USERS_FILE = path.join(__dirname, 'users.json');
const SALT_ROUNDS = 10;

// helpers
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8').trim();
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse users.json, starting with an empty array. Error:', err.message);
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function looksLikeHospitalId(v) {
  if (!v) return false;
  return /^HOSP/i.test(v) || /^H\d+/i.test(v);
}
function looksLikePhone(v) {
  if (!v) return false;
  return /^(\+?\d{6,})$/.test(v);
}
function looksLikeEmail(v) {
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

async function addUser({ staff_id, name, hospital_id, email, phone, plainPassword }) {
  if (!staff_id || !plainPassword) {
    throw new Error('staff_id and password are required');
  }

  // auto-swap if caller passed hospital_id/phone swapped
  if (looksLikePhone(hospital_id) && looksLikeHospitalId(phone)) {
    console.warn('Detected hospital_id and phone look swapped. Auto-swapping them.');
    const tmp = hospital_id;
    hospital_id = phone;
    phone = tmp;
  }

  const users = loadUsers();

  if (users.find(u => u.staff_id === staff_id)) {
    throw new Error(`User with staff_id "${staff_id}" already exists`);
  }
  if (email && users.find(u => u.email === email)) {
    throw new Error(`User with email "${email}" already exists`);
  }

  const password_hash = await bcrypt.hash(plainPassword, SALT_ROUNDS);

  const newUser = {
    staff_id,
    name: name || '',
    hospital_id: hospital_id || '',
    email: email || '',
    phone: phone || '',
    password_hash
  };

  users.push(newUser);
  saveUsers(users);

  console.log('✅ User added:', staff_id);
  console.log('  name:', newUser.name);
  console.log('  hospital_id:', newUser.hospital_id);
  console.log('  email:', newUser.email);
  console.log('  phone:', newUser.phone);
  console.log('Saved users.json at:', USERS_FILE);
}

// Parse args more flexibly: staff_id is first, password is last, other fields are between
// Expected order: staff_id, name (can be multi-word), hospital_id, email, phone, password
// We'll reconstruct: staff_id = args[0], password = args[last], phone = args[last-1], email = args[last-2], hospital_id = args[last-3], name = join(args[1..last-4])
(function main(){
  const args = process.argv.slice(2);
  if (args.length < 6) {
    console.log('Usage: node create_user.js <staff_id> <name (can be multi-word)> <hospital_id> <email> <phone> <password>');
    console.log('Example: node create_user.js STAFF001 "John Doe" HOSP1001 john@example.com +919876543210 MyPass123');
    process.exit(1);
  }

  const staff_id = args[0];
  const password = args[args.length - 1];
  const phone = args[args.length - 2];
  const email = args[args.length - 3];
  const hospital_id = args[args.length - 4];
  const nameParts = args.slice(1, args.length - 4);
  const name = nameParts.join(' ');

  // basic validation
  if (!looksLikeEmail(email)) {
    console.warn('Warning: email does not look valid:', email);
    // continue, but you may want to abort in strict mode
  }
  if (!looksLikePhone(phone)) {
    console.warn('Warning: phone does not look like a phone number:', phone);
  }

  addUser({ staff_id, name, hospital_id, email, phone, plainPassword: password })
    .catch(err => {
      console.error('Error adding user:', err.message);
      process.exit(1);
    });
})();

