const express = require("express");
const userRouter = express.Router();
const userModel = require("../databaseConnection").User;
const bcrypt = require("bcryptjs");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
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
  SemesterSession,
} = require("../databaseConnection");

userRouter.post("/getUser", async (req, res) => {
  try {
    const { idNumber, password, rememberMe } = req.body;

    // Find user
    const user = await User.findOne({ idNumber });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Validate password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid password" });
    }

    // Get current active session
    const currentSessionDoc = await SemesterSession.findOne({ isActive: true });
    let level = null;

    if (
      user.accountType === "student" &&
      user.session &&
      currentSessionDoc?.session
    ) {
      const studentYear = parseInt(user.session.split("/")[0]);
      const currentYear = parseInt(currentSessionDoc.session.split("/")[0]);

      const yearDiff = currentYear - studentYear;

      // Level is 100 + (yearDiff * 100)
      level = `${100 + yearDiff * 100}`;
    }

    // Prepare user data
    const userData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      idNumber: user.idNumber,
      accountType: user.accountType,
      department: user.department,
      programme: user.programme,
      session: user.session,
      level: level || "N/A",
      createdAt: user.createdAt,
    };

    // Create JWT token
    const token = jwt.sign(
      { id: user._id, idNumber: user.idNumber },
      process.env.JWT_SECRET_KEY,
      { expiresIn: rememberMe ? "30d" : "20m" }
    );

    // Set HTTP-only cookie
    res.cookie("authToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 40 * 60 * 1000,
    });

    res.json({ success: true, message: "Login successful", user: userData });
  } catch (error) {
    console.error("Error validating user:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Route to add a new user
userRouter.post("/addUser", async (req, res) => {
  try {
    console.log(req.body);

    const {
      firstName,
      lastName,
      email,
      department,
      programme,
      session, // new field
      idNumber,
      password,
      superAdminPasscode,
      accountType,
    } = req.body;

    // Validate required fields
    if (
      !firstName ||
      !lastName ||
      !email ||
      !idNumber ||
      !password ||
      !accountType
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Check if the email or ID number is already registered
    const existingUser = await userModel.findOne({
      $or: [{ email }, { idNumber }],
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message:
          existingUser.email === email
            ? "Email is already registered. Use a different email."
            : "ID number is already registered. Use a different ID number.",
      });
    }

    // Validate admin passcode
    if (superAdminPasscode !== process.env.SUPER_ADMIN_PASS_CODE) {
      return res.status(403).json({
        success: false,
        message: "Incorrect Admin PassCode",
      });
    }

    // Session format validation (only for students)
    if (accountType === "student" && session) {
      const sessionFormat = /^\d{4}\/\d{4}$/;

      if (!sessionFormat.test(session)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid session format. Expected 'YYYY/YYYY' format (e.g., 2023/2024)",
        });
      }

      const [startYear, endYear] = session.split("/").map(Number);
      if (endYear - startYear !== 1) {
        return res.status(400).json({
          success: false,
          message:
            "Session years must have exactly a 1-year gap (e.g., 2023/2024)",
        });
      }
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(
      password,
      parseInt(process.env.SALT_ROUNDS) || 10
    );

    // Create new user
    const newUser = new userModel({
      firstName,
      lastName,
      email,
      idNumber,
      password: hashedPassword,
      accountType,
    });

    // Add student-only fields if applicable
    if (accountType === "student") {
      if (department) newUser.department = department;
      if (programme) newUser.programme = programme;
      if (session) newUser.session = session;
    }

    // Save to DB
    const savedUser = await newUser.save();

    console.log("New user added");
    return res.status(201).json({
      success: true,
      message: "Registration Successful",
      user: savedUser,
    });
  } catch (error) {
    console.error("Error adding user:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
});



userRouter.get("/getLoggedInUser", async (req, res) => {
  try {
    console.log("User logged in with cookies");

    const token = req.cookies.authToken;
    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided", user: null });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found", user: null });
    }

    // Get the current active session
    const currentSessionDoc = await SemesterSession.findOne({ isActive: true });
    let level = null;

    if (
      user.accountType === "student" &&
      user.session &&
      currentSessionDoc?.session
    ) {
      const studentYear = parseInt(user.session.split("/")[0]);
      const currentYear = parseInt(currentSessionDoc.session.split("/")[0]);

      const yearDiff = currentYear - studentYear;
      level = `${100 + yearDiff * 100}`;
    }

    const userData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      idNumber: user.idNumber,
      accountType: user.accountType,
      department: user.department,
      programme: user.programme,
      session: user.session,
      level: level || "N/A",
      createdAt: user.createdAt,
    };

    res.json({
      success: true,
      message: "User retrieved successfully",
      user: userData,
    });
  } catch (error) {
    console.error("Error fetching logged-in user:", error.message);
    if (error.name === "JsonWebTokenError") {
      return res
        .status(401)
        .json({
          success: false,
          message: "Invalid or expired token",
          user: null,
        });
    }
    res
      .status(500)
      .json({ success: false, message: error.message, user: null });
  }
});

// Route to log out the user
userRouter.post("/logout", async (req, res) => {
  try {
    res.clearCookie("authToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
    });

    res.status(200).json({ success: true, message: "Logout successful" });
  } catch (error) {
    console.error("Logout error:", error.message);
    res.status(500).json({ success: false, message: "An error occurred during logout" });
  }
});


module.exports = { userRouter };
