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
} = require("./databaseConnection");

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
  
module.exports = { studentRouter };
