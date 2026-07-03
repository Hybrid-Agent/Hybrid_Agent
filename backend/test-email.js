require('dotenv').config();
const mailer = require('./src/services/mailer');
mailer.send({ to: "test@example.com", subject: "Test Email", text: "Testing 123" })
  .then(res => console.log("Success:", res))
  .catch(err => console.error("Error:", err));
