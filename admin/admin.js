const express = require("express");
const adminRouter = express.Router();
const department = require("../departments.js");

const {
  startConnection,
  User,
  Department,
  Course,
  PrivilegeRequest,
  Result,
  SemesterSession,
} = require("../databaseConnection");

// --- Grade Calculator ---
function getGrade(score) {
  if (score >= 70) return "A";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  if (score >= 45) return "D";
  return "F";
}

adminRouter.post("/getRequestStatus", async (req, res) => {
  try {
    const { lecturerId } = req.body;

    if (!lecturerId) {
      return res.status(400).json({ message: "Missing lecturer ID" });
    }

    const requests = await PrivilegeRequest.find({ lecturer: lecturerId })
      .populate("course", "courseCode") // get courseCode from Course model
      .sort({ createdAt: -1 });

    const formattedRequests = requests.map((req) => ({
      courseCode: req.course?.courseCode || "N/A",
      status: req.status,
    }));

    return res.status(200).json({ success: true, requests: formattedRequests });
  } catch (err) {
    console.error("Error fetching request statuses:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// --- 1. Request Upload Privilege ---
// --- 1. Request Upload Privilege ---
adminRouter.post("/uploadRight", async (req, res) => {
  try {
    console.log("Right being requested");
    const { lecturerId, courseCode } = req.body;

    if (!lecturerId || !courseCode) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const course = await Course.findOne({ courseCode: courseCode });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check if an approved request already exists
    const approvedRequest = await PrivilegeRequest.findOne({
      lecturer: lecturerId,
      course: course._id,
      status: "approved",
    });

    if (approvedRequest) {
      return res.status(400).json({
        success: false,
        message: "You already have access to upload for this course",
      });
    }

    // Check if a pending request already exists
    const pendingRequest = await PrivilegeRequest.findOne({
      lecturer: lecturerId,
      course: course._id,
      status: "pending",
    });

    if (pendingRequest) {
      return res.status(400).json({
        success: false,
        message: "You already have a pending request for this course",
      });
    }

    // Create a new privilege request
    const newRequest = new PrivilegeRequest({
      lecturer: lecturerId,
      course: course._id,
      courseCode: courseCode,
    });

    await newRequest.save();

    const requests = await PrivilegeRequest.find({ lecturer: lecturerId });

    res.status(201).json({
      success: true,
      message: "Privilege request sent",
      request: newRequest,
      requests: requests,
    });
  } catch (err) {
    console.error("Privilege request error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
});



// --- 2. Upload Test Result ---
adminRouter.post("/uploadTest", async (req, res) => {
  try {
    const {
      idNumber,
      courseCode,
      session,
      semester,
      score,
      unit,
      overallScore,
      uploadedById,
    } = req.body;

    if (
      !idNumber ||
      !courseCode ||
      !session ||
      !semester ||
      score == null ||
      !unit ||
      !uploadedById
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const student = await User.findOne({ idNumber });
    const course = await Course.findOne({ courseCode });
    const uploadedBy = await User.findById(uploadedById);

    if (!student || !course || !uploadedBy) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Student, course, or uploader not found",
        });
    }

    let result = await Result.findOne({
      student: student._id,
      course: course._id,
      session,
      semester,
    });

    if (!result) {
      result = new Result({
        student: student._id,
        course: course._id,
        session,
        semester,
        testScore: score,
        unit,
        testOverall: overallScore,
        uploadedBy: uploadedBy._id,
      });
    } else {
      result.testScore = score;
      result.unit = unit;
      result.testOverall = overallScore;
    }

    const test = result.testScore || 0;
    const exam = result.examScore || 0;

    result.totalScore = test + exam;
    result.grade = getGrade(result.totalScore);

    await result.save();

    res
      .status(200)
      .json({ success: true, message: "Test result uploaded", result });
  } catch (err) {
    console.error("Test upload error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// --- 3. Upload Exam Result ---
adminRouter.post("/uploadExam", async (req, res) => {
  try {
    const {
      idNumber,
      courseCode,
      session,
      semester,
      score,
      overallScore,
      uploadedById,
    } = req.body;

    if (
      !idNumber ||
      !courseCode ||
      !session ||
      !semester ||
      score == null ||
      !uploadedById
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const student = await User.findOne({ idNumber });
    const course = await Course.findOne({ courseCode });
    const uploadedBy = await User.findById(uploadedById);

    if (!student || !course || !uploadedBy) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Student, course, or uploader not found",
        });
    }

    const result = await Result.findOne({
      student: student._id,
      course: course._id,
      session,
      semester,
    });

    if (!result) {
      return res
        .status(400)
        .json({ success: false, message: "Test must be uploaded before exam" });
    }

    result.examScore = score;
    result.examOverall = overallScore;

    const test = result.testScore || 0;
    const exam = result.examScore || 0;

    result.totalScore = test + exam;
    result.grade = getGrade(result.totalScore);

    await result.save();

    res.status(200).json({ message: "Exam result uploaded", result });
  } catch (err) {
    console.error("Exam upload error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Route to get lecturer's approved courses + previously uploaded results + session list
adminRouter.post("/uploadResultData", async (req, res) => {
  try {
    const { userId } = req.body;
    console.log(userId);

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing user ID" });
    }

    const user = await User.findById(userId);
    if (!user || user.accountType !== "admin") {
      return res.status(403).json({
        success: false,
        message: "User is not a lecturer or does not exist",
      });
    }

    // Get approved privileges for this lecturer
    const approvedPrivileges = await PrivilegeRequest.find({
      lecturer: userId,
      status: "approved",
    }).populate("course", "courseCode courseTitle");

    const courses = approvedPrivileges.map((priv) => ({
      courseId: priv.course._id,
      courseCode: priv.course?.courseCode || "N/A",
      courseTitle: priv.course?.courseTitle || "N/A",
    }));

    // Get all results uploaded by this lecturer
    const uploadedResults = await Result.find({ uploadedBy: userId })
      .populate("student", "firstName lastName idNumber")
      .populate("course", "courseCode courseTitle");

    const formattedResults = uploadedResults.map((res) => ({
      studentName: `${res.student.firstName} ${res.student.lastName}`,
      idNumber: res.student.idNumber,
      courseCode: res.course.courseCode,
      courseTitle: res.course.courseTitle,
      testScore: res.testScore,
      examScore: res.examScore,
      totalScore: res.totalScore,
      grade: res.grade,
      unit: res.unit,
      semester: res.semester,
      session: res.session,
      uploadedAt: res.uploadedAt,
      approved: res.approved,
    }));

    // Get available sessions
    const sessions = await SemesterSession.find().distinct("session");

    return res.status(200).json({
      success: true,
      courses,
      uploadedResults: formattedResults,
      sessions,
    });
  } catch (err) {
    console.error("Error fetching lecturer privileges and results:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

adminRouter.post("/uploadResult", async (req, res) => {
  try {
    const {
      courseCode,
      courseTitle,
      matricNumber,
      resultType, // 'test' or 'exam'
      score,
      semester,
      session,
      unit,
      userId, // Admin ID
    } = req.body;

    // Validate required fields
    if (
      !courseCode ||
      !courseTitle ||
      !matricNumber ||
      !resultType ||
      score == null ||
      !semester ||
      !session ||
      !unit ||
      !userId
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    if (!["test", "exam"].includes(resultType)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Invalid result type, must be 'test' or 'exam'",
        });
    }

    const admin = await User.findById(userId);
    if (!admin || admin.accountType !== "admin") {
      return res
        .status(404)
        .json({ success: false, message: "Admin not found or invalid ID" });
    }

    const student = await User.findOne({ idNumber: matricNumber });
    if (!student || student.accountType !== "student") {
      return res
        .status(404)
        .json({ success: false, message: "Student not found or invalid ID" });
    }

    const course = await Course.findOne({ courseCode });
    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    // Validate semester rule (odd/even course numbers)
    const courseNumber = parseInt(courseCode.replace(/\D/g, ""), 10);
    const isEven = courseNumber % 2 === 0;
    if (isEven && semester !== "Second") {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Even-numbered courses can only be uploaded for the Second semester",
        });
    }
    if (!isEven && semester !== "First") {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Odd-numbered courses can only be uploaded for the First semester",
        });
    }

    // Validate score
    if (resultType === "test" && (score < 0 || score > 30)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Test score must be between 0 and 30",
        });
    }
    if (resultType === "exam" && (score < 0 || score > 70)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Exam score must be between 0 and 70",
        });
    }

    // Find existing result for same student+course+semester+session
    let result = await Result.findOne({
      student: student._id,
      course: course._id,
      semester,
      session,
    });

    if (result) {
      // Enforce unit consistency for existing results
      if (result.unit !== unit) {
        return res.status(400).json({
          success: false,
          message: `Unit mismatch: this result was originally created with ${result.unit} unit(s). You must use the same unit.`,
        });
      }
    } else {
      // Create new result if not exists
      result = new Result({
        student: student._id,
        course: course._id,
        semester,
        session,
        unit,
        uploadedBy: userId,
      });
    }

    // Update score
    if (resultType === "test") {
      result.testScore = score;
    } else {
      result.examScore = score;
    }

    // Calculate total score and grade
    const testScore = result.testScore || 0;
    const examScore = result.examScore || 0;
    result.totalScore = testScore + examScore;
    result.grade = getGrade(result.totalScore);

    await result.save();

    // Fetch all results uploaded by this admin
    const uploadedResults = await Result.find({ uploadedBy: userId })
      .populate("student", "firstName lastName idNumber")
      .populate("course", "courseCode courseTitle");

    const formattedResults = uploadedResults.map((res) => ({
      studentName: `${res.student.firstName} ${res.student.lastName}`,
      idNumber: res.student.idNumber,
      courseCode: res.course.courseCode,
      courseTitle: res.course.courseTitle,
      testScore: res.testScore,
      examScore: res.examScore,
      totalScore: res.totalScore,
      grade: res.grade,
      unit: res.unit,
      semester: res.semester,
      session: res.session,
      uploadedAt: res.uploadedAt,
      approved: res.approved,
    }));

    return res.status(200).json({
      success: true,
      message: `${resultType} result uploaded successfully`,
      uploadedResults: formattedResults,
    });
  } catch (err) {
    console.error("Error uploading result:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = { adminRouter };
