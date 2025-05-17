const express = require("express");
const adminRouter = express.Router();
const department = require("../departments.js");
const bcrypt = require("bcrypt");

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
      resultType,
      score,
      semester,
      session,
      unit,
      userId,
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
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    if (!["test", "exam"].includes(resultType)) {
      return res.status(400).json({ success: false, message: "Invalid result type" });
    }

    const admin = await User.findById(userId);
    if (!admin || admin.accountType !== "admin") {
      return res.status(404).json({ success: false, message: "Invalid admin ID" });
    }

    const student = await User.findOne({ idNumber: matricNumber });
    if (!student || student.accountType !== "student") {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const course = await Course.findOne({ courseCode });
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    // Semester rule validation (even/odd course code)
    const courseNumber = parseInt(courseCode.replace(/\D/g, ""), 10);
    const isEven = courseNumber % 2 === 0;
    if (isEven && semester !== "Second") {
      return res.status(400).json({ success: false, message: "Even-numbered courses can only be uploaded for the Second semester" });
    }
    if (!isEven && semester !== "First") {
      return res.status(400).json({ success: false, message: "Odd-numbered courses can only be uploaded for the First semester" });
    }

    // Score validation
    if (resultType === "test" && (score < 0 || score > 30)) {
      return res.status(400).json({ success: false, message: "Test score must be between 0 and 30" });
    }
    if (resultType === "exam" && (score < 0 || score > 70)) {
      return res.status(400).json({ success: false, message: "Exam score must be between 0 and 70" });
    }

    let result = await Result.findOne({
      student: student._id,
      course: course._id,
      semester,
      session,
    });

    // If result already exists and is approved, block update
    if (result && result.approved) {
      return res.status(403).json({
        success: false,
        message: "Cannot update a result that has already been approved",
      });
    }

    if (result) {
      if (result.unit !== unit) {
        return res.status(400).json({
          success: false,
          message: `Unit mismatch: previously recorded as ${result.unit} unit(s).`,
        });
      }
    } else {
      result = new Result({
        student: student._id,
        course: course._id,
        semester,
        session,
        unit,
        uploadedBy: userId,
      });
    }

    // Update the relevant score
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



adminRouter.post("/studentPerformance", async (req, res) => {
  try {
    const { matricNumber } = req.body;

    if (!matricNumber) {
      return res.status(400).json({ success: false, message: "Matric number is required" });
    }

    const student = await User.findOne({ idNumber: matricNumber });
    console.log(student.session)
    console.log(student)

    if (!student || student.accountType !== "student") {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const approvedResults = await Result.find({ student: student._id, approved: true })
      .populate("course", "courseCode courseTitle")
      .sort({ session: 1, semester: 1 });

    if (!approvedResults.length) {
      return res.status(404).json({ success: false, message: "No approved results found for this student" });
    }

    // Get the current active session
    const currentSessionDoc = await SemesterSession.findOne({ isActive: true });
    if (!currentSessionDoc || !currentSessionDoc.session) {
      return res.status(500).json({ success: false, message: "Active session not found or invalid format" });
    }

    const studentSession = student.session; // e.g., "2023/2024"
    const currentSession = currentSessionDoc.session; // e.g., "2025/2026"

    console.log(studentSession, currentSession);

    // Helper to get the first year of a session string
    const getStartYear = (sessionStr) => {
      if (!sessionStr || !sessionStr.includes("/")) return null;
      return parseInt(sessionStr.split("/")[0]);
    };

    const studentStartYear = getStartYear(studentSession);
    const currentStartYear = getStartYear(currentSession);

    // If either is invalid, return error
    if (!studentStartYear || !currentStartYear) {
      return res.status(400).json({ success: false, message: "Invalid session format" });
    }

    const levelNumber = (currentStartYear - studentStartYear + 1) * 100;
    const level = `${levelNumber} Level`;

    const gradePointMap = { A: 5, B: 4, C: 3, D: 2, F: 0 };
    const gradeDistributionCount = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    const sessionSemesterMap = {};
    const semesterGPA = [];
    const courseList = [];

    let totalUnitsAll = 0;
    let totalGradePointsAll = 0;

    for (const res of approvedResults) {
      const gradePoint = gradePointMap[res.grade] || 0;
      const semesterKey = `${res.semester} ${res.session}`;

      // Grade distribution count
      gradeDistributionCount[res.grade] += 1;

      // GPA per semester calculation
      if (!sessionSemesterMap[semesterKey]) {
        sessionSemesterMap[semesterKey] = { totalGradePoints: 0, totalUnits: 0 };
      }
      sessionSemesterMap[semesterKey].totalGradePoints += gradePoint * res.unit;
      sessionSemesterMap[semesterKey].totalUnits += res.unit;

      totalGradePointsAll += gradePoint * res.unit;
      totalUnitsAll += res.unit;

      // Courses list
      courseList.push({
        id: res._id,
        code: res.course.courseCode,
        title: res.course.courseTitle,
        semester: semesterKey,
        test: res.testScore || 0,
        exam: res.examScore || 0,
        total: res.totalScore,
        grade: res.grade,
        gradePoint: gradePoint,
      });
    }

    // Semester GPA list
    let semId = 1;
    for (const [key, data] of Object.entries(sessionSemesterMap)) {
      const gpa = data.totalUnits ? (data.totalGradePoints / data.totalUnits).toFixed(2) : 0;
      semesterGPA.push({ id: semId++, name: key, gpa: parseFloat(gpa) });
    }

    // Grade distribution with percentages
    const totalCourses = approvedResults.length;
    const gradeDistribution = Object.entries(gradeDistributionCount).map(([grade, count]) => ({
      grade,
      count,
      percentage: Math.round((count / totalCourses) * 100),
    }));

    // Percentile rank is mocked for now
    const percentile = Math.round((totalGradePointsAll / (totalUnitsAll * 5)) * 100);
    const cgpa = totalUnitsAll ? (totalGradePointsAll / totalUnitsAll).toFixed(2) : "0.00";

    return res.status(200).json({
      success: true,
      student: {
        id: student.idNumber,
        name: `${student.firstName} ${student.lastName}`,
        department: student.department,
        programme: student.programme,
        level: level,
        cgpa: parseFloat(cgpa),
        rank: 5, // Mocked
        totalStudents: 120, // Mocked
        percentile: percentile,
      },
      semesters: semesterGPA,
      courses: courseList,
      gradeDistribution,
    });
  } catch (err) {
    console.error("Error fetching student performance:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});


adminRouter.post("/course-session-analysis", async (req, res) => {
  try {
    const { session, courseId, analysisType } = req.body;

    const sessions = await SemesterSession.find().sort({ session: -1 });
    const departments = await Department.find();
    const courses = await Course.find();

    if (!analysisType) {
      return res.status(200).json({
        success: true,
        sessions: sessions.map((s) => s.session),
        departments,
        courses,
      });
    }

    // ----------------- COURSE ANALYSIS -----------------
    if (analysisType === "course" && courseId && session) {
      const results = await Result.find({
        course: courseId,
        session,
        approved: true,
      }).populate("student", "firstName lastName department");

      const totalStudents = results.length;
      if (!totalStudents) {
        return res.status(404).json({ success: false, message: "No results found" });
      }

      const scoreStats = results.map((r) => r.totalScore);
      const averageScore = scoreStats.reduce((a, b) => a + b, 0) / totalStudents;
      const highestScore = Math.max(...scoreStats);
      const lowestScore = Math.min(...scoreStats);

      const gradeMap = { A: 0, B: 0, C: 0, D: 0, F: 0 };
      const scoreRanges = Array(10).fill(0);
      let passCount = 0;

      const allPerformers = results.map((r) => {
        const idx = Math.min(Math.floor(r.totalScore / 10), 9);
        scoreRanges[idx]++;
        if (gradeMap[r.grade] !== undefined) gradeMap[r.grade]++;
        if (r.grade !== "F") passCount++;

        return {
          name: `${r.student.firstName} ${r.student.lastName}`,
          score: r.totalScore,
          grade: r.grade,
          department: r.student.department || "Unknown",
        };
      });

      const topPerformers = allPerformers.sort((a, b) => b.score - a.score).slice(0, 5);

      const gradeDistribution = Object.entries(gradeMap).map(([grade, count]) => ({
        grade,
        count,
        percentage: Math.round((count / totalStudents) * 100),
      }));

      const scoreRangeData = scoreRanges.map((count, i) => ({
        range: `${i * 10}-${i * 10 + 9}`,
        count,
      }));

      const course = await Course.findById(courseId);

      return res.status(200).json({
        success: true,
        analysisType: "course",
        data: {
          courseCode: course.courseCode,
          courseTitle: course.courseTitle,
          session,
          totalStudents,
          averageScore: Math.round(averageScore),
          highestScore,
          lowestScore,
          passRate: Math.round((passCount / totalStudents) * 100), // ✅ fixed
          gradeDistribution,
          scoreRanges: scoreRangeData,
          topPerformers,
        },
      });
    }

    // ----------------- SESSION ANALYSIS -----------------
    if (analysisType === "session" && session) {
      const results = await Result.find({ session, approved: true }).populate("student", "firstName lastName department");

      if (!results.length) {
        return res.status(404).json({ success: false, message: "No session data found" });
      }

      const departmentMap = {};
      const studentStats = {};
      const gradeMap = { A: 0, B: 0, C: 0, D: 0, F: 0 };
      const studentPassedMap = {}; // studentId => boolean

      for (let r of results) {
        const gradePoint = { A: 5, B: 4, C: 3, D: 2, F: 0 }[r.grade] || 0;
        const { _id: studentId, firstName, lastName, department } = r.student;
        const dept = department || "Unknown";

        // Init department map
        if (!departmentMap[dept]) {
          departmentMap[dept] = {
            totalPoints: 0,
            totalUnits: 0,
            studentIds: new Set(),
            passedStudentIds: new Set(),
          };
        }

        // Init student map
        if (!studentStats[studentId]) {
          studentStats[studentId] = {
            totalPoints: 0,
            totalUnits: 0,
            name: `${firstName} ${lastName}`,
            department: dept,
          };
        }

        // Update stats
        departmentMap[dept].totalPoints += gradePoint * r.unit;
        departmentMap[dept].totalUnits += r.unit;
        departmentMap[dept].studentIds.add(studentId.toString());

        studentStats[studentId].totalPoints += gradePoint * r.unit;
        studentStats[studentId].totalUnits += r.unit;

        if (r.grade !== "F") {
          departmentMap[dept].passedStudentIds.add(studentId.toString());
          studentPassedMap[studentId] = true;
        }

        if (gradeMap[r.grade] !== undefined) gradeMap[r.grade]++;
      }

      const totalStudents = Object.keys(studentStats).length;
      const totalCourses = [...new Set(results.map((r) => r.course.toString()))].length;

      const topPerformers = Object.entries(studentStats)
        .map(([_, s]) => ({
          name: s.name,
          gpa: s.totalUnits ? s.totalPoints / s.totalUnits : 0,
          department: s.department,
        }))
        .sort((a, b) => b.gpa - a.gpa)
        .slice(0, 5);

      const avgGPA =
        Object.values(studentStats).reduce((sum, s) => sum + (s.totalPoints / s.totalUnits), 0) /
        totalStudents;

      const departmentPerformance = Object.entries(departmentMap).map(([dept, d]) => {
        const studentCount = d.studentIds.size || 1;
        const passedCount = d.passedStudentIds.size || 0;

        return {
          department: dept,
          averageGPA: d.totalUnits ? d.totalPoints / d.totalUnits : 0,
          passRate: Math.round((passedCount / studentCount) * 100), // ✅ fixed
        };
      });

      const gradeDistribution = Object.entries(gradeMap).map(([grade, count]) => ({
        grade,
        count,
        percentage: Math.round((count / results.length) * 100),
      }));

      return res.status(200).json({
        success: true,
        analysisType: "session",
        data: {
          session,
          totalStudents,
          totalCourses,
          averageGPA: parseFloat(avgGPA.toFixed(2)),
          gradeDistribution,
          departmentPerformance,
          topPerformers,
        },
      });
    }

    return res.status(400).json({ success: false, message: "Invalid parameters" });
  } catch (err) {
    console.error("Error in course-session analysis:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});


adminRouter.get("/courses-and-sessions", async (req, res) => {
  try {
    const courses = await Course.find().sort({ courseCode: 1 }); // Optional: sorted
    const sessions = await SemesterSession.find().sort({ session: -1 }); // Most recent first

    return res.status(200).json({
      success: true,
      courses,
      sessions: sessions.map((s) => s.session), // just session strings
    });
  } catch (error) {
    console.error("Error fetching courses and sessions:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});


adminRouter.post("/change-password", async (req, res) => {
  const { adminId, oldPassword, newPassword } = req.body;

  console.log( adminId, oldPassword, newPassword )

  try {
    const admin = await User.findById(adminId);
    if (!admin || admin.accountType !== "admin") {
      return res.status(404).json({ message: "Admin not found" });
    }

    const isMatch = await bcrypt.compare(oldPassword, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Old password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    admin.password = hashedPassword;
    await admin.save();

    res.status(200).json({success:true, message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error changing password", error: err.message });
  }
});


adminRouter.get("/semester/current-next", async (req, res) => {
  try {
    const current = await SemesterSession.findOne({ isActive: true });
    if (!current) {
      return res.status(404).json({ message: "No active semester found" });
    }

    let nextSemester, nextSession;

    if (current.semester.toLowerCase() === "first") {
      nextSemester = "Second";
      nextSession = current.session;
    } else {
      nextSemester = "First";

      // Increment session: e.g., "2024/2025" → "2025/2026"
      const [start, end] = current.session.split("/").map(Number);
      nextSession = `${start + 1}/${end + 1}`;
    }

    res.status(200).json({
      success:true,
      current: {
        semester: current.semester,
        session: current.session,
      },
      next: {
        semester: nextSemester,
        session: nextSession,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching semesters", error: err.message });
  }
});



module.exports = { adminRouter };
