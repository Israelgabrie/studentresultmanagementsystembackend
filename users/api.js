const express = require('express');
const userRouter = express.Router();
const userModel = require("../databaseConnection").User;
const bcrypt = require('bcrypt');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require("multer");
const pdfParse = require("pdf-parse");

// Middleware for parsing cookies
userRouter.use(cookieParser());
const upload = multer();
const {
  startConnection,
  User,
  Department,
  Course,
  PrivilegeRequest,
  Result,
  SemesterSession
} = require("../databaseConnection");



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
                process.env.JWT_SECRET_KEY,
                { expiresIn: "30d" } // ✅ JWT valid for 30 days
              );
              
            // Set JWT as an HTTP-only cookie
            res.cookie("authToken", token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "Strict",
                maxAge: 30 * 24 * 60 * 60 * 1000, // ✅ 30 days in ms
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
      console.log("error adding user "+error.message)
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
