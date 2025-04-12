const express = require('express');
const userRouter = express.Router();
const userModel = require("../databaseConnection").userModel;
const bcrypt = require('bcrypt');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require("multer");
const pdfParse = require("pdf-parse");

// Middleware for parsing cookies
userRouter.use(cookieParser());
const upload = multer();


function parseCourseRegistration(input) {
  const lines = input.split('\n').map(line => line.trim()).filter(line => line);
  
  const idNumber = lines.find(line => /^\d{11}$/.test(line)) || '';
  const session = lines.find(line => /\d{4}\/\d{4}/) || '';
  const semesterMatch = input.match(/(First|Second)/i);
  const semester = semesterMatch ? semesterMatch[1] : '';

  const totalMatch = input.match(/TOTAL\s*(\d+)/);
  const totalUnit = totalMatch ? totalMatch[1] : '';

  const courseLines = lines.slice(lines.findIndex(line => line.includes('S/NC')) + 1);
  const courses = [];
  
  for (let i = 0; i < courseLines.length; i++) {
    const match = courseLines[i].match(/^(\d+)([A-Z]{2,}\s?\d{3})(.+?)\s+(\d+)$/);
    if (match) {
      courses.push({
        courseCode: match[2].trim(),
        courseTitle: match[3].trim(),
        unit: match[4].trim()
      });
    } else if (courses.length > 0) {
      // Handle multi-line course title
      courses[courses.length - 1].courseTitle += ' ' + courseLines[i].trim();
    }
  }

  return {
    totalUnit,
    totalCourses: courses.length,
    semester: semester,
    idNumber,
    session,
    courses
  };
}

function countCourses(text) {
  // Match lines that start with a number (S/N) followed by a course code
  const courseLines = text.match(/^\d+[A-Z ]+\d+/gm);
  return courseLines ? courseLines.length : 0;
}

function extractSession(text) {
  const match = text.match(/\b\d{4}\/\d{4}\b/);
  return match ? match[0] : null;
}

function extractSemester(text) {
  const match = text.match(/\b(Fir|Firs|First|Sec|Seco|Secon|Second)\b/i);
  if (!match) return null;

  const partial = match[0].toLowerCase();
  if (partial.startsWith('fir')) return 'First';
  if (partial.startsWith('sec')) return 'Second';

  return null;
}

function extractCourses(input) {
  // 1) Grab only the lines between S/N… and TOTAL
  const lines = input.split(/\r?\n/);
  const startIdx = lines.findIndex(l => l.trim().startsWith('S/N'));
  const endIdx   = lines.findIndex(l => l.trim().startsWith('TOTAL'));
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) return [];

  const block = lines.slice(startIdx + 1, endIdx).join('\n');

  // 2) Split into entries at each "serial + code"
  const rawEntries = block.split(/(?=\d+\s*[A-Z]{3}\s*\d{3})/);

  // 3) Keep only those that actually look like courses
  const entries = rawEntries.filter(e => /\d+\s*[A-Z]{3}\s*\d{3}/.test(e));

  // 4) Parse each one
  const courses = entries.map(e => {
    // collapse all whitespace into single spaces
    const line = e.replace(/\s+/g, ' ').trim();
    // serial, code, title…, unit
    const m = line.match(/^\d+\s*([A-Z]{3}\s*\d{3})\s+(.*?)\s+(\d+)$/);
    if (!m) return null;

    let [, courseCode, courseTitle, unit] = m;
    // strip any stray trailing number on the title (from PDF artefacts)
    courseTitle = courseTitle.replace(/\s*\d+$/, '').trim();

    return { courseCode: courseCode.trim(), courseTitle, unit: unit.trim() };
  })
  .filter(x => x); // drop nulls

  return courses;
}

  userRouter.post("/upload", upload.single("file"), async (req, res) => {
    try {
      console.log("File upload request received");
      if (!req.file) {
        return res.status(400).json({ success: false, message: "No file uploaded" });
      }
  
     const data = await pdfParse(req.file.buffer);
     const text = data.text;
     console.log(text)
     const result = parseCourseRegistration(text);
     result.totalCourses = countCourses(text) - 1;
     result.session = extractSession(text);
     result.semester = extractSemester(text);
     result.courses = extractCourses(text);
     console.log(extractCourses(text))

     
      return res.json({
        success: true,
        message: "Data retrieved successfully",
        data: result,
      });
    } catch (error) {
      console.error("PDF processing error:", error);
      res.status(500).json({ success: false, message: "Error processing file" });
    }
  });


// Route to get user by ID and validate password
userRouter.post("/getUser", async (req, res) => {
    try {
        console.log(req.body);
        const { idNumber, password, rememberMe } = req.body;

        // Find user by ID number
        const user = await userModel.findOne({ idNumber });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Validate password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: "Invalid password" });
        }

        // Prepare response data
        const userData = {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            idNumber: user.idNumber,
            accountType: user.accountType,
        };

        // Handle Remember Me (Create JWT Token)
        if (rememberMe) {
            const token = jwt.sign(
                { id: user._id, idNumber: user.idNumber },
                process.env.JWT_SECRET_KEY, // Use a strong secret key
                { expiresIn: "20m" } // Valid for 7 days
            );

            // Set JWT as an HTTP-only cookie
            res.cookie("authToken", token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production", // Secure cookies in production
                sameSite: "Strict",
                maxAge: 40 * 60 * 1000, // 40 minutes
            });
        }else{
          const token = jwt.sign(
            { id: user._id, idNumber: user.idNumber },
            process.env.JWT_SECRET_KEY, // Use a strong secret key
            { expiresIn: "20m" } // Valid for 7 days
        );

        // Set JWT as an HTTP-only cookie
        res.cookie("authToken", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production", // Secure cookies in production
            sameSite: "Strict",
            maxAge: 40 * 60 * 1000, // 40 minutes
        });
        }

        res.json({ success: true, message: "Login successful", user: userData });

    } catch (error) {
        console.log("Error validating user: " + error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Route to add a new user
userRouter.post("/addUser", async (req, res) => {
    try {
        console.log(req.body);

        const { firstName, lastName, email, department, programme, idNumber, password, superAdminPasscode, accountType } = req.body;

        // Validate required fields
        if (!firstName || !lastName || !email || !idNumber || !password || !accountType) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        // Check if the email or ID number is already registered
        const existingUser = await userModel.findOne({ $or: [{ email }, { idNumber }] });
        if (existingUser) {
            return res.status(409).json({ 
                success: false, 
                message: existingUser.email === email 
                    ? "Email is already registered. Use a different email." 
                    : "ID number is already registered. Use a different ID number." 
            });
        }

        // Validate admin passcode
        if (superAdminPasscode !== process.env.SUPER_ADMIN_PASS_CODE) {
            return res.status(403).json({ success: false, message: "Incorrect Admin PassCode" });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, parseInt(process.env.SALT_ROUNDS) || 10);

        // Create a new user object
        const newUser = new userModel({
            firstName,
            lastName,
            email,
            idNumber,
            password: hashedPassword,
            accountType,
        });

        // Add optional fields only if they exist
        if (department) newUser.department = department;
        if (programme) newUser.programme = programme;

        // Save the user to the database
        const savedUser = await newUser.save();

        console.log("New user added");
        res.status(201).json({ success: true, message: "Registration Successful", user: savedUser });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Route to get the logged-in user
userRouter.get("/getLoggedInUser", async (req, res) => {
    try {
        console.log("user logged in with cookies"); // Log the cookies for debugging

        // Access the token from cookies
        const token = req.cookies.authToken; 

        if (!token) {
            return res.status(401).json({ success: false, message: "No token provided", user: null });
        }

        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

        // Find the user by ID
        const user = await userModel.findById(decoded.id).select("-password"); // Exclude password from response

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found", user: null });
        }

        // Send back the user data in the response
        res.json({ success: true, message: "User retrieved successfully", user });

    } catch (error) {
        console.log("Error fetching logged-in user:", error.message);
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, message: "Invalid or expired token", user: null });
        }
        res.status(500).json({ success: false, message: error.message, user: null });
    }
});

module.exports = { userRouter };
