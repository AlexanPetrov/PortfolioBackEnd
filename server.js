const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const nodemailer = require("nodemailer");
const validator = require("validator");
const mysql = require("mysql");
const rateLimit = require("express-rate-limit");
const app = express();

require("dotenv").config();

const allowedOrigins = process.env.CORS_ORIGIN.split(",");

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW, 10),
  max: parseInt(process.env.RATE_LIMIT_MAX, 10),
});

app.use(express.json());
// app.use(
//   cors({
//     origin: process.env.CORS_ORIGIN,
//     methods: "GET,POST,DELETE",
//     credentials: true,
//   })
// );
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: "GET,POST,DELETE",
    credentials: true,
  })
);

app.use(morgan("combined"));

// Address inline styling errors before production!
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"
  );
  next();
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SENDER_EMAIL,
    pass: process.env.SENDER_PASSWORD,
  },
});

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to the database:", err);
    process.exit(1);
  }
  console.log("Connected to the database.");
});

app.get("/getAll", limiter, (req, res) => {
  const sql = "SELECT * FROM contact_submissions";
  db.query(sql, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Internal Server Error");
    }
    res.status(200).json(result);
  });
});

app.get("/get/:id", limiter, (req, res) => {
  const id = req.params.id;
  const sql = "SELECT * FROM contact_submissions WHERE id = ?";
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Internal Server Error");
    }
    if (result.length === 0) {
      return res.status(404).send("Record not found");
    }
    res.status(200).json(result[0]);
  });
});

app.delete("/delete/:id", limiter, (req, res) => {
  const id = req.params.id;

  const sql = "DELETE FROM contact_submissions WHERE id = ?";
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Internal Server Error");
    }
    if (result.affectedRows === 0) {
      return res.status(404).send("Record not found");
    }
    res.status(200).send(`Deleted record with id ${id}`);
  });
});

app.delete("/deleteAll", limiter, (req, res) => {
  const sql = "DELETE FROM contact_submissions";

  db.query(sql, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Internal Server Error");
    }
    res.status(200).send("All records deleted");
  });
});

app.post("/submit", limiter, (req, res) => {
  let { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).send("All fields are required.");
  }

  name = validator.escape(name);
  email = validator.escape(email);
  subject = validator.escape(subject);
  message = validator.escape(message);

  if (!validator.isEmail(email)) {
    return res.status(400).send("Invalid email format.");
  }

  const sql =
    "INSERT INTO contact_submissions (name, email, subject, message) VALUES (?, ?, ?, ?)";
  const values = [name, email, subject, message];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Internal Server Error");
    }
    res.status(200).send("Submission successful.");
  });

  const mailOptions = {
    from: email,
    to: process.env.RECEIVER_EMAIL,
    subject: "New Contact Submission",
    text: `Name: ${name}, Email: ${email}, Subject: ${subject}, Message: ${message}`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log(error);
    } else {
      console.log("Email sent: " + info.response);
    }
  });
});

app.listen(process.env.SERVER_PORT, () => {
  console.log(`Server running at http://localhost:${process.env.SERVER_PORT}`);
});
