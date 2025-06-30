const express = require("express");
const studentRouter = express.Router();
const {
  startConnection,
  User,
  Department,
  Course,
  PrivilegeRequest,
  Result,
  SemesterSession,
  CourseFeedback,
  StudentComplaint,
} = require("./databaseConnection");
// utils/multerConfig.js
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const pdfkit  = require("pdfkit");
const PDFDocument = require("pdfkit");





function getGradePoint(grade) {
  switch (grade) {
    case "A":
      return 5;
    case "B":
      return 4;
    case "C":
      return 3;
    case "D":
      return 2;
    case "F":
      return 0;
    default:
      return null;
  }
}

const logoPath =  path.join(__dirname, "./superAdminRoutes/mtu logo.png"); 

studentRouter.post("/downloadResult", async (req, res) => {
  try {
    const { matricNumber, session } = req.body;

    if (!matricNumber || !session) {
      return res.status(400).json({ success: false, message: "Matric number and session are required." });
    }

    const student = await User.findOne({ idNumber: matricNumber, accountType: "student" });
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found." });
    }

    const allResults = await Result.find({ student: student._id, approved: true }).populate("course");
    if (!allResults.length) {
      return res.status(404).json({ success: false, message: "No results found." });
    }

    const currentResults = allResults.filter(r => r.session === session);
    const pastResults = allResults.filter(r => r.session !== session);

    if (!currentResults.length) {
      return res.status(404).json({ success: false, message: "No results for the selected session." });
    }

    const getGradePoint = (grade) => {
      switch (grade) {
        case "A": return 5;
        case "B": return 4;
        case "C": return 3;
        case "D": return 2;
        case "F": return 0;
        default: return null;
      }
    };

    const calculateGPA = (results) => {
      let totalPoints = 0, totalUnits = 0, earnedUnits = 0;
      results.forEach(r => {
        const gp = getGradePoint(r.grade);
        if (gp !== null) {
          totalPoints += gp * r.unit;
          totalUnits += r.unit;
          if (gp > 0) earnedUnits += r.unit;
        }
      });
      return {
        GPA: totalUnits > 0 ? (totalPoints / totalUnits).toFixed(2) : "0.00",
        totalUnits,
        earnedUnits
      };
    };

    const currentStats = calculateGPA(currentResults);
    const previousStats = calculateGPA(pastResults);
    const overallStats = calculateGPA(allResults);

    // === PDF START ===
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=${matricNumber}_result.pdf`,
        "Content-Length": pdfBuffer.length
      });
      res.send(pdfBuffer);
    });

    // === HEADER ===
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, doc.page.width / 2 - 40, 20, { width: 80 });
    }

    doc.moveDown(4);
    doc.font("Helvetica-Bold").fontSize(16).text("Official Student Result", { align: "center" });
    doc.moveDown(1.5);
    doc.font("Helvetica").fontSize(11)
      .text(`Name: ${student.firstName} ${student.lastName}`)
      .text(`Matric Number: ${student.idNumber}`)
      .text(`Department: ${student.department || "N/A"}`)
      .text(`Programme: ${student.programme || "N/A"}`)
      .text(`Session: ${session}`);
    doc.moveDown(1);

    // === TABLE HEADER ===
    const tableTop = doc.y + 10;
    const colX = [50, 90, 180, 250, 320];
    const colWidths = [40, 90, 70, 60, 60];
    const headers = ["S/N", "Course Code", "Unit", "Score", "Grade"];

    doc.font("Helvetica-Bold").fontSize(10);
    headers.forEach((header, i) => {
      doc.rect(colX[i], tableTop, colWidths[i], 20).fillAndStroke("#e4e4e4", "#000");
      doc.fillColor("#000").text(header, colX[i] + 5, tableTop + 6);
    });

    // === TABLE BODY ===
    doc.font("Helvetica").fontSize(10).fillColor("#000");
    let rowY = tableTop + 20;

    currentResults.forEach((r, i) => {
      const values = [
        `${i + 1}`,
        r.course?.courseCode || "N/A",
        `${r.unit}`,
        `${r.totalScore}`,
        r.grade
      ];

      values.forEach((val, j) => {
        doc.rect(colX[j], rowY, colWidths[j], 20).stroke();
        doc.text(val, colX[j] + 5, rowY + 6);
      });

      rowY += 20;
      if (rowY > doc.page.height - 100) {
        doc.addPage();
        rowY = 50;
      }
    });

    doc.moveDown(2);

    // === GPA / CGPA / Units Summary ===
    doc.moveDown();
    doc.font("Helvetica-Bold").text("Summary", { underline: true });
    doc.font("Helvetica").fontSize(11)
      .text(`Current GPA: ${currentStats.GPA}`)
      .text(`Current Semester Units Attempted: ${currentStats.totalUnits}`)
      .text(`Current Semester Units Earned: ${currentStats.earnedUnits}`)
      .moveDown()
      .text(`Previous GPA: ${previousStats.GPA}`)
      .text(`Previous Total Units Attempted: ${previousStats.totalUnits}`)
      .text(`Previous Total Units Earned: ${previousStats.earnedUnits}`)
      .moveDown()
      .text(`Cumulative CGPA: ${overallStats.GPA}`)
      .text(`Total Units Attempted (All Time): ${overallStats.totalUnits}`)
      .text(`Total Units Earned (All Time): ${overallStats.earnedUnits}`);

    doc.moveDown(2);
    doc.fontSize(9).text(`Generated: ${new Date().toLocaleString()}`, { align: "right" });

    doc.end();
  } catch (error) {
    console.error("PDF generation error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


studentRouter.post("/studentResultSessions", async (req, res) => {
  try {
    const { studentId } = req.body;

    if (!studentId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing student ID" });
    }

    // Verify that the user exists and is a student
    const student = await User.findById(studentId);
    if (!student || student.accountType !== "student") {
      return res.status(404).json({
        success: false,
        message: "Student not found or invalid account type",
      });
    }

    // Find all results for this student
    const sessions = await Result.distinct("session", { student: studentId });

    if (!sessions.length) {
      return res
        .status(404)
        .json({ success: false, message: "No result sessions found" });
    }

    // Sort sessions (optional)
    sessions.sort(); // alphabetically (e.g., "2018/2019", "2019/2020", ...)

    res.status(200).json({
      success: true,
      student: {
        fullName: `${student.firstName} ${student.lastName}`,
        idNumber: student.idNumber,
      },
      sessions,
    });
  } catch (err) {
    console.error("Error fetching result sessions:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

studentRouter.post("/studentResultSummary", async (req, res) => {
  try {
    const { studentId } = req.body;

    if (!studentId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing student ID" });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found" });
    }

    const results = await Result.find({ student: student._id }).populate(
      "course"
    );

    if (!results.length) {
      return res
        .status(404)
        .json({ success: false, message: "No results found" });
    }

    let totalPoints = 0;
    let totalUnits = 0;

    const formattedResults = results.map((res) => {
      const gradePoint = getGradePoint(res.grade);
      const unit = res.unit || 0;

      if (gradePoint !== null && unit > 0) {
        totalPoints += gradePoint * unit;
        totalUnits += unit;
      }

      return {
        courseCode: res.course?.courseCode || "N/A",
        courseTitle: res.course?.courseTitle || "N/A",
        grade: res.grade,
        gradePoint,
        unit,
        totalScore: res.totalScore,
        semester: res.semester,
        session: res.session,
      };
    });

    const GPA = totalUnits > 0 ? (totalPoints / totalUnits).toFixed(2) : "0.00";

    res.status(200).json({
      success: true,
      student: {
        name: `${student.firstName} ${student.lastName}`,
        idNumber: student.idNumber,
      },
      GPA,
      totalUnits,
      totalCourses: formattedResults.length,
      results: formattedResults,
    });
  } catch (err) {
    console.error("Student summary error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// --- Helper to group results by session and semester ---
function groupResults(results) {
  const grouped = {};

  results.forEach((res) => {
    const session = res.session;
    const semester = res.semester;

    if (!grouped[session]) grouped[session] = {};
    if (!grouped[session][semester]) grouped[session][semester] = [];

    grouped[session][semester].push({
      courseCode: res.course?.courseCode || "N/A",
      courseTitle: res.course?.courseTitle || "N/A",
      testScore: res.testScore,
      examScore: res.examScore,
      totalScore: res.totalScore,
      unit: res.unit,
      grade: res.grade,
      approved: res.approved,
      uploadedBy: res.uploadedBy,
      uploadedAt: res.uploadedAt,
    });
  });

  return grouped;
}

studentRouter.post("/viewResult", async (req, res) => {
  try {
    const { studentId, session, semester } = req.body;

    if (!studentId || !session || !semester) {
      return res.status(400).json({
        success: false,
        message: "Missing studentId, session, or semester",
      });
    }

    const student = await User.findById(studentId);
    if (!student || student.accountType !== "student") {
      return res.status(404).json({
        success: false,
        message: "Student not found or invalid account type",
      });
    }

    // Fetch all approved results for the student
    const allApprovedResults = await Result.find({
      student: studentId,
      approved: true,
    }).populate("course");

    if (!allApprovedResults.length) {
      return res.status(404).json({
        success: false,
        message: "No approved results found for this student",
      });
    }

    // Filter results for the selected session and semester (for GPA)
    const currentResults = allApprovedResults.filter(
      (r) =>
        r.session === session &&
        r.semester.toLowerCase() === semester.toLowerCase()
    );

    if (!currentResults.length) {
      return res.status(404).json({
        success: false,
        message: "No results found for this semester and session",
      });
    }

    // Helper to convert grade to grade point
    const gradeToPoint = (grade) => {
      const scale = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };
      return scale[grade.toUpperCase()] ?? 0;
    };

    // GPA calculation (current semester)
    const totalUnits = currentResults.reduce((sum, r) => sum + r.unit, 0);
    const totalGradePoints = currentResults.reduce(
      (sum, r) => sum + gradeToPoint(r.grade) * r.unit,
      0
    );
    const GPA =
      totalUnits > 0 ? (totalGradePoints / totalUnits).toFixed(2) : "0.00";

    // CGPA calculation (all results)
    const cumulativeUnits = allApprovedResults.reduce(
      (sum, r) => sum + r.unit,
      0
    );
    const cumulativeGradePoints = allApprovedResults.reduce(
      (sum, r) => sum + gradeToPoint(r.grade) * r.unit,
      0
    );
    const CGPA =
      cumulativeUnits > 0
        ? (cumulativeGradePoints / cumulativeUnits).toFixed(2)
        : "0.00";

    // Format course result data
    const courses = currentResults.map((r) => ({
      courseCode: r.course.courseCode,
      courseTitle: r.course.courseTitle,
      testScore: `${r.testScore}/30`,
      examScore: `${r.examScore}/70`,
      totalScore: r.totalScore,
      grade: r.grade,
      unit: r.unit,
    }));

    // Respond to frontend
    res.status(200).json({
      success: true,
      student: {
        fullName: `${student.firstName} ${student.lastName}`,
        idNumber: student.idNumber,
        department: student.department || "N/A",
        programme: student.programme || "N/A",
      },
      session,
      semester,
      GPA,
      CGPA,
      totalUnits,
      courses,
    });
  } catch (err) {
    console.error("View result error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

studentRouter.post("/courseAnalysis", async (req, res) => {
  const { courseCode, session } = req.body;
  console.log(courseCode, session);

  if (!courseCode || !session) {
    return res
      .status(400)
      .json({ success: false, error: "Course code and session are required" });
  }

  try {
    // Case-insensitive course lookup
    const course = await Course.findOne({
      courseCode: new RegExp(`^${courseCode}$`, "i"),
    });

    if (!course) {
      return res
        .status(404)
        .json({ success: false, error: "Course not found" });
    }

    // Get results for the course and session
    const results = await Result.find({ course: course._id, session }).populate(
      "uploadedBy"
    );

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No results found for this course and session",
      });
    }

    // Grade distribution
    const gradeCounts = { A: 0, B: 0, C: 0, D: 0, F: 0 };

    results.forEach((r) => {
      const grade = (r.grade || "").trim().toUpperCase();
      if (gradeCounts.hasOwnProperty(grade)) {
        gradeCounts[grade]++;
      }
    });

    const total = results.length;
    const passed =
      gradeCounts.A + gradeCounts.B + gradeCounts.C + gradeCounts.D; // include D as pass? adjust as needed
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(2) : "0.00";

    const lecturer = results[0].uploadedBy;

    // Get feedback for course and session
    const feedbacks = await CourseFeedback.find({
      course: course._id,
      session,
    }).populate("student", "firstName lastName");

    const formattedFeedbacks = feedbacks.map((f) => ({
      student: `${f.student.firstName} ${f.student.lastName}`,
      comment: f.comment,
    }));

    res.json({
      success: true,
      courseCode: course.courseCode,
      courseTitle: course.courseTitle,
      lecturer: lecturer
        ? `${lecturer.firstName} ${lecturer.lastName}`
        : "Unknown",
      session,
      gradeCounts,
      passRate,
      feedback: formattedFeedbacks,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

studentRouter.get("/courses", async (req, res) => {
  try {
    const courses = await Course.find();
    res.status(200).json({ success: true, courses });
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

const complaintTypes = [
  "missing result",
  "system error",
  "wrong grade",
  "other",
];

studentRouter.get("/getComplaintTypes", async (req, res) => {
  try {
    res.status(200).json({ success: true, complaintTypes });
  } catch (error) {
    console.error("Error fetching complaint types:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// --- File Upload Middleware ---
const uploadDir = path.join(__dirname, "../uploads/complaints");

// Ensure folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/jpg",
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF and image files are allowed!"), false);
  }
};

const complaintUpload = multer({ storage, fileFilter });

// --- Complaint Submission Route ---
studentRouter.post(
  "/addComplaint",
  complaintUpload.single("proofFile"),
  async (req, res) => {
    try {
      console.log(req.body);
      const { student, complaintType, description, course } = req.body;

      if (!student || !complaintType || !description) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // If complaint is "missing result", proofFile must be present
      if (complaintType === "missing result" && !req.file) {
        return res.status(400).json({
          error: "Proof file required for missing result complaints",
        });
      }

      const newComplaint = new StudentComplaint({
        student,
        complaintType,
        description,
        course: course || null,
        proofFileUrl: req.file
          ? `/uploads/complaints/${req.file.filename}`
          : null,
      });

      await newComplaint.save();

      // Fetch all complaints by this student
      const allComplaints = await StudentComplaint.find({ student }).sort({
        createdAt: -1,
      });

      res.status(201).json({
        message: "Complaint submitted successfully",
        complaint: newComplaint,
        allComplaints,
        success: true,
      });
    } catch (err) {
      console.error("Error saving complaint:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// --- Get All Complaints by a Student ---
studentRouter.post("/getStudentComplaints", async (req, res) => {
  try {
    console.log("getting student result complaint");
    const { student } = req.body;

    if (!student) {
      return res.status(400).json({ error: "Student ID is required" });
    }

    const complaints = await StudentComplaint.find({ student }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      message: "Complaints fetched successfully",
      complaints,
      success: true,
    });
  } catch (err) {
    console.error("Error fetching complaints:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Delete a Complaint and Return Updated List ---
studentRouter.post("/deleteStudentComplaint", async (req, res) => {
  try {
    const { student, complaintId } = req.body;

    if (!student || !complaintId) {
      return res
        .status(400)
        .json({ error: "Student ID and Complaint ID are required" });
    }

    // Delete the complaint
    await StudentComplaint.findOneAndDelete({ _id: complaintId, student });

    // Fetch updated complaints
    const updatedComplaints = await StudentComplaint.find({ student }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      message: "Complaint deleted and updated complaints fetched successfully",
      complaints: updatedComplaints,
      success: true,
    });
  } catch (err) {
    console.error("Error deleting complaint:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

studentRouter.get("/getAllSessions", async (req, res) => {
  try {
    const semesterSessions = await SemesterSession.find();
    res.send({ success: true, sessions: semesterSessions });
  } catch (err) {
    console.error("Error getting all sessions", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

studentRouter.post("/addCourseFeedback", async (req, res) => {
  try {
    const { course, student, session, text } = req.body;

    if (!course || !student || !session || !text) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required." });
    }

    // Create and save the new feedback
    const newFeedback = new CourseFeedback({ course, student, session, text });
    await newFeedback.save();

    // Fetch up to 7 random feedbacks
    const total = await CourseFeedback.countDocuments();
    const limit = Math.min(7, total);

    const randomIndexes = [];
    while (randomIndexes.length < limit) {
      const rand = Math.floor(Math.random() * total);
      if (!randomIndexes.includes(rand)) {
        randomIndexes.push(rand);
      }
    }

    const feedbackPromises = randomIndexes.map((index) =>
      CourseFeedback.findOne()
        .skip(index)
        .populate("course", "courseCode courseTitle")
        .populate("student", "firstName lastName")
    );

    const randomFeedbacks = await Promise.all(feedbackPromises);

    res.status(201).json({
      success: true,
      message: "Feedback submitted successfully.",
      randomFeedback: randomFeedbacks,
    });
  } catch (error) {
    console.error("Error adding feedback:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// POST /student/searchCourseFeedback
studentRouter.post("/searchCourseFeedback", async (req, res) => {
  try {
    const { courseCode } = req.body;

    if (!courseCode) {
      return res
        .status(400)
        .json({ success: false, message: "Course code is required." });
    }

    const course = await Course.findOne({
      courseCode: {
        $regex: new RegExp("^" + courseCode.replace(/\s+/g, ""), "i"),
      }, // flexible match like "cse203" or "CSE 203"
    });

    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found." });
    }

    const feedbacks = await CourseFeedback.find({ course: course._id })
      .populate("student", "firstName lastName")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, feedbacks });
  } catch (error) {
    console.error("Error searching course feedback:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// GET /student/randomCourseFeedback
studentRouter.get("/randomCourseFeedback", async (req, res) => {
  try {
    const total = await CourseFeedback.countDocuments();

    if (total === 0) {
      return res.status(200).json({
        success: true,
        feedback: [],
        message: "No feedback available.",
      });
    }

    const limit = Math.min(7, total); // get up to 7
    const randomIndexes = [];

    while (randomIndexes.length < limit) {
      const rand = Math.floor(Math.random() * total);
      if (!randomIndexes.includes(rand)) {
        randomIndexes.push(rand);
      }
    }

    // Fetch feedbacks using .skip(index) for each random index
    const feedbackPromises = randomIndexes.map((index) =>
      CourseFeedback.findOne()
        .skip(index)
        .populate("course", "courseCode courseTitle")
        .populate("student", "firstName lastName")
    );

    const randomFeedbacks = await Promise.all(feedbackPromises);

    res.status(200).json({ success: true, feedback: randomFeedbacks });
  } catch (error) {
    console.error("Error fetching random feedback:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

studentRouter.get("/getActiveSemesterAndSession", async (req, res) => {
  try {
    const activeSemesterAndSession = await SemesterSession.find({
      isActive: true,
    });
    if (activeSemesterAndSession) {
      return res.json({
        success: true,
        sesmesterAndSession: activeSemesterAndSession,
      });
    } else {
      return res.json({
        success: false,
        sesmesterAndSession: { semester: "N/A", session: "N/a" },
      });
    }
  } catch (error) {
    console.error("Error getting active session and semester ", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

module.exports = { studentRouter };
