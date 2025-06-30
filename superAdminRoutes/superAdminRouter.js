const express = require("express");
const superAdminRouter = express.Router();
const {
  User,
  Department,
  Course,
  PrivilegeRequest,
  Result,
  SemesterSession,
  StudentComplaint,
  Event,
} = require("../databaseConnection");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const universityLogoPath = path.join(__dirname, "./mtu logo.png"); // ✅ Change this path


superAdminRouter.post("/generateCourseResultPdf", async (req, res) => {
  try {
    const { courseCode, session } = req.body;

    if (!courseCode) {
      return res.status(400).json({ success: false, message: "courseCode is required" });
    }

    const course = await Course.findOne({ courseCode });
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    const query = {
      course: course._id,
      approved: true,
    };
    if (session) query.session = session;

    const results = await Result.find(query)
      .populate("student", "firstName lastName idNumber department programme")
      .populate("uploadedBy", "firstName lastName email");

    if (!results.length) {
      return res.status(404).json({ success: false, message: "No approved results found" });
    }

    const lecturers = {};
    const semester = results[0].semester;
    const courseUnit = results[0].unit;
    const courseSession = results[0].session;

    results.forEach((r) => {
      if (r.uploadedBy && !lecturers[r.uploadedBy._id]) {
        lecturers[r.uploadedBy._id] = r.uploadedBy;
      }
    });

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=${courseCode}_results.pdf`,
        "Content-Length": pdfBuffer.length,
      });
      res.send(pdfBuffer);
    });

    if (fs.existsSync(universityLogoPath)) {
      doc.image(universityLogoPath, doc.page.width / 2 - 50, 30, { width: 100 });
    }

    doc.moveDown(3);
    doc.fontSize(18).font("Helvetica-Bold").text("Course  Result Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(13).font("Helvetica").text(`Course Code: ${course.courseCode}`);
    doc.text(`Course Title: ${course.courseTitle}`);
    doc.text(`Unit: ${courseUnit}`);
    doc.text(`Semester: ${semester}`);
    doc.text(`Session: ${courseSession}`);
    doc.moveDown();

    doc.fontSize(14).font("Helvetica-Bold").text("Lecturer(s):");
    Object.values(lecturers).forEach((lec) => {
      doc.fontSize(12).font("Helvetica").text(`• ${lec.firstName} ${lec.lastName} (${lec.email})`);
    });
    doc.moveDown();

    const headers = ["Name", "Matric No", "Dept", "Programme", "Test", "Exam", "Total", "Grade"];
    const colWidths = [90, 70, 90, 80, 40, 40, 40, 40];
    const startX = doc.x;
    let currentY = doc.y + 10;
    const getX = (i) => startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);

    doc.font("Helvetica-Bold").fontSize(9);
    headers.forEach((header, i) => {
      doc.rect(getX(i), currentY, colWidths[i], 20).stroke();
      doc.text(header, getX(i) + 2, currentY + 6, {
        width: colWidths[i] - 4,
        align: "center",
      });
    });
    currentY += 20;

    doc.font("Helvetica").fontSize(8);
    results.forEach((r) => {
      const s = r.student;
      const values = [
        `${s.firstName} ${s.lastName}`,
        s.idNumber,
        s.department?.length > 18 ? s.department.slice(0, 17) + "…" : s.department,
        s.programme?.length > 16 ? s.programme.slice(0, 15) + "…" : s.programme,
        r.testScore ?? "-",
        r.examScore ?? "-",
        r.totalScore,
        r.grade,
      ];

      const rowHeight = 20;
      values.forEach((text, i) => {
        doc.rect(getX(i), currentY, colWidths[i], rowHeight).stroke();
        doc.text(String(text), getX(i) + 2, currentY + 6, {
          width: colWidths[i] - 4,
          align: "center",
        });
      });

      currentY += rowHeight;
      if (currentY > doc.page.height - 60) {
        doc.addPage();
        currentY = 50;
      }
    });

    doc.end();
  } catch (error) {
    console.error("PDF generation failed:", error);
    res.status(500).json({ success: false, message: error.message || "Internal server error" });
  }
});



// Route to get all the pending and approved privilege requests
superAdminRouter.post("/allRequests", async (req, res) => {
  try {
    const { userId } = req.body;
    console.log("super admin is here");

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "userId is required" });
    }

    const user = await User.findOne({ _id: userId });
    console.log(user);

    if (!user || user.accountType !== "superAdmin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized – superadmin access required",
      });
    }

    // Get all pending and approved privilege requests
    const [pendingRequests, approvedRequests] = await Promise.all([
      PrivilegeRequest.find({ status: "pending" })
        .populate("lecturer", "firstName lastName email idNumber")
        .populate("course", "courseCode courseTitle"),
      PrivilegeRequest.find({ status: "approved" })
        .populate("lecturer", "firstName lastName email idNumber")
        .populate("course", "courseCode courseTitle"),
    ]);

    return res.json({
      success: true,
      message: "Privilege requests fetched successfully",
      requests: pendingRequests,
      approvedRequests,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
});

// Route to approve or delete a privilege request
superAdminRouter.post("/handleRequest", async (req, res) => {
  try {
    const { userId, requestId, approved } = req.body;

    if (!userId || !requestId || typeof approved !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "userId, requestId, and approved (boolean) are required",
      });
    }

    const user = await User.findById(userId);
    if (!user || user.accountType !== "superAdmin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized – superadmin access required",
      });
    }

    const request = await PrivilegeRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Privilege request not found",
      });
    }

    let actionMessage = "";
    if (approved) {
      request.status = "approved";
      await request.save();
      actionMessage = "Privilege request approved";
    } else {
      await PrivilegeRequest.deleteOne({ _id: requestId });
      actionMessage = "Privilege request deleted";
    }

    // Fetch updated pending and approved requests
    const [pendingRequests, approvedRequests] = await Promise.all([
      PrivilegeRequest.find({ status: "pending" })
        .populate("lecturer", "firstName lastName email idNumber")
        .populate("course", "courseCode courseTitle"),
      PrivilegeRequest.find({ status: "approved" })
        .populate("lecturer", "firstName lastName email idNumber")
        .populate("course", "courseCode courseTitle"),
    ]);

    return res.json({
      success: true,
      message: actionMessage,
      requests: pendingRequests,
      approvedRequests,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
});

superAdminRouter.post("/updateSettings", async (req, res) => {
  try {
    const { userId, semester, session } = req.body;

    if (!userId || !semester || !session) {
      return res.status(400).json({
        success: false,
        message: "userId, semester, and session are required",
      });
    }

    const user = await User.findById(userId);
    if (!user || user.accountType !== "superAdmin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized – superadmin access required",
      });
    }

    // Validate semester
    if (semester !== "First" && semester !== "Second") {
      return res.status(400).json({
        success: false,
        message: "Invalid semester type. Must be 'First' or 'Second'.",
      });
    }

    // Validate session format e.g., "2024/2025"
    const sessionFormat = /^\d{4}\/\d{4}$/;
    if (!sessionFormat.test(session)) {
      return res.status(400).json({
        success: false,
        message: "Invalid session format. Expected 'YYYY/YYYY'.",
      });
    }

    // Ensure the session does not already exist
    const existingSession = await SemesterSession.findOne({
      session,
      semester,
    });
    if (existingSession) {
      return res.status(400).json({
        success: false,
        message: "This semester and session combination already exists.",
      });
    }

    // Set all existing documents' isActive to false
    await SemesterSession.updateMany({}, { isActive: false });

    // Create the new active semester-session
    const newSemester = await SemesterSession.create({
      semester,
      session,
      isActive: true,
    });

    // Return all entries (most recent first)
    const allSemesters = await SemesterSession.find().sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "New semester/session added and set as active.",
      data: allSemesters,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
});

superAdminRouter.post("/manageResultData", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    const user = await User.findById(userId);

    if (!user || user.accountType !== "superAdmin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized – superadmin access required",
      });
    }

    const pendingFilter = {
      approved: false,
      testScore: { $ne: null },
      examScore: { $ne: null },
    };

    const [latestPending, latestApproved] = await Promise.all([
      Result.find(pendingFilter)
        .sort({ uploadedAt: -1 })
        .limit(10)
        .populate("student", "firstName lastName email idNumber")
        .populate("course", "courseCode courseTitle")
        .populate("uploadedBy", "firstName lastName email idNumber"),

      Result.find({ approved: true })
        .sort({ uploadedAt: -1 })
        .limit(10)
        .populate("student", "firstName lastName email idNumber")
        .populate("course", "courseCode courseTitle")
        .populate("uploadedBy", "firstName lastName email idNumber"),
    ]);

    return res.status(200).json({
      success: true,
      message: "Fetched latest approved and pending results",
      latestPending,
      latestApproved,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
});

superAdminRouter.post("/handleResultApproval", async (req, res) => {
  try {
    const { userId, resultId, approved } = req.body;

    if (!userId || !resultId || typeof approved !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "userId, resultId, and approved (boolean) are required",
      });
    }

    const user = await User.findById(userId);
    if (!user || user.accountType !== "superAdmin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized – superadmin access required",
      });
    }

    const result = await Result.findById(resultId);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Result not found",
      });
    }

    let actionMessage = "";

    if (approved) {
      result.approved = true;
      result.approvedBy = user._id;
      result.approvedAt = new Date();
      await result.save();
      actionMessage = "Result approved successfully.";
    } else {
      await Result.deleteOne({ _id: resultId });
      actionMessage = "Result deleted successfully.";
    }

    // Return updated latest results
    const pendingFilter = {
      approved: false,
      testScore: { $ne: null },
      examScore: { $ne: null },
    };

    const [latestPending, latestApproved] = await Promise.all([
      Result.find(pendingFilter)
        .sort({ uploadedAt: -1 })
        .limit(10)
        .populate("student", "firstName lastName email idNumber")
        .populate("course", "courseCode courseTitle")
        .populate("uploadedBy", "firstName lastName email idNumber"),

      Result.find({ approved: true })
        .sort({ uploadedAt: -1 })
        .limit(10)
        .populate("student", "firstName lastName email idNumber")
        .populate("course", "courseCode courseTitle")
        .populate("uploadedBy", "firstName lastName email idNumber"),
    ]);

    return res.status(200).json({
      success: true,
      message: actionMessage,
      latestPending,
      latestApproved,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
});

superAdminRouter.post("/dashboardData", async (req, res) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user || user.accountType !== "superAdmin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: You do not have the required permissions.",
      });
    }

    const studentCount = await User.countDocuments({ accountType: "student" });
    const lecturerCount = await User.countDocuments({
      accountType: "lecturer",
    });
    const adminCount = await User.countDocuments({ accountType: "superAdmin" });
    const courseCount = await Course.countDocuments();

    const totalResults = await Result.countDocuments();
    const approvedResults = await Result.countDocuments({ approved: true });
    const pendingResults = await Result.countDocuments({
      approved: false,
      testScore: { $ne: null },
      examScore: { $ne: null },
    });

    const totalRequests = await PrivilegeRequest.countDocuments();
    const pendingRequests = await PrivilegeRequest.countDocuments({
      status: "pending",
    });
    const approvedRequests = await PrivilegeRequest.countDocuments({
      status: "approved",
    });

    const systemSettings = await SemesterSession.findOne({ isActive: true });
    const semester = systemSettings?.semester || "Unknown Semester";
    const session = systemSettings?.session || "Unknown Session";

    // Get all departments
    const allDepartments = await Department.find();
    const sampledDepartments = allDepartments
      .sort(() => 0.5 - Math.random())
      .slice(0, 5);

    const departmentStats = await Promise.all(
      sampledDepartments.map(async (dept) => {
        // Get student IDs in this department
        const studentsInDept = await User.find({
          accountType: "student",
          department: dept.name,
        }).select("_id");

        const studentIds = studentsInDept.map((s) => s._id);

        const resultCount = await Result.countDocuments({
          student: { $in: studentIds },
        });
        const approvedCount = await Result.countDocuments({
          student: { $in: studentIds },
          approved: true,
        });

        return {
          department: dept.name,
          totalResults: resultCount,
          approvedResults: approvedCount,
        };
      })
    );

    const recentResults = await Result.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("student course uploadedBy"); // Populate student and course

    const recentRequests = await PrivilegeRequest.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("lecturer course"); // Populate lecturer and course

    const recentResultsFormatted = recentResults.map((result) => ({
      student: `${result.student.firstName} ${result.student.lastName}`,
      courseCode: result.course.courseCode,
      lecturer: `${result.uploadedBy.firstName} ${result.uploadedBy.lastName}`,
      date: result.createdAt,
      status: result.approved ? "Approved" : "Pending",
    }));

    const recentRequestsFormatted = recentRequests.map((req) => ({
      lecturer: `${req.lecturer.firstName} ${req.lecturer.lastName}`,
      courseCode: req.course.courseCode,
      date: req.createdAt,
      status:
        req.status === "approved"
          ? "Approved"
          : req.status === "rejected"
          ? "Rejected"
          : "Pending",
      idNumber: user.idNumber, // Adding admin's idNumber to each request
    }));

    res.status(200).json({
      success: true,
      stats: {
        students: studentCount,
        lecturers: lecturerCount,
        admins: adminCount,
        courses: courseCount,
        results: {
          total: totalResults,
          pending: pendingResults,
          approved: approvedResults,
        },
        requests: {
          total: totalRequests,
          pending: pendingRequests,
          approved: approvedRequests,
        },
        semester,
        session,
      },
      departmentBreakdown: departmentStats,
      recentResults: recentResultsFormatted,
      recentRequests: recentRequestsFormatted,
    });
  } catch (err) {
    console.error("Dashboard data error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
});

superAdminRouter.post("/addCourse", async (req, res) => {
  try {
    const { userId, courseCode, courseTitle } = req.body;

    // Validate required fields
    if (!userId || !courseCode || !courseTitle) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: userId, courseCode, or courseTitle.",
      });
    }

    // Validate super admin access
    const user = await User.findById(userId);
    if (!user || user.accountType !== "superAdmin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: You do not have the required permissions.",
      });
    }

    // Validate courseCode format (e.g., CSC 101, MTH 201)
    const codePattern = /^[A-Z]{3}\s\d{3}$/;
    if (!codePattern.test(courseCode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid course code format. Use format like 'CSC 101'.",
      });
    }

    // Check for duplicate courseCode
    const existingCourse = await Course.findOne({
      courseCode: courseCode.trim().toUpperCase(),
    });
    if (existingCourse) {
      return res.status(409).json({
        success: false,
        message: "A course with this course code already exists.",
      });
    }

    // Save the course
    const courseInstance = new Course({
      courseCode: courseCode.trim().toUpperCase(),
      courseTitle: courseTitle.trim(),
    });

    await courseInstance.save();

    res.status(201).json({
      success: true,
      message: "Course added successfully.",
      course: {
        id: courseInstance._id,
        courseCode: courseInstance.courseCode,
        courseTitle: courseInstance.courseTitle,
      },
    });
  } catch (err) {
    console.error("Add course error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
});

superAdminRouter.get("/randomCourses", async (req, res) => {
  try {
    const randomCourses = await Course.aggregate([{ $sample: { size: 15 } }]);

    res.status(200).json({
      success: true,
      message: "Fetched 15 random courses successfully.",
      courses: randomCourses,
    });
  } catch (err) {
    console.error("Fetch random courses error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching random courses.",
      error: err.message,
    });
  }
});

superAdminRouter.post("/deleteCourse", async (req, res) => {
  try {
    const { userId, courseId } = req.body;
    console.log(userId, courseId);

    // Validate user
    const user = await User.findById(userId);
    if (!user || user.accountType !== "superAdmin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Only superAdmins can delete courses.",
      });
    }

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    // Delete the course
    await Course.findByIdAndDelete(courseId);

    // Fetch 15 random courses after deletion
    const randomCourses = await Course.aggregate([{ $sample: { size: 15 } }]);

    res.status(200).json({
      success: true,
      message: "Course deleted successfully.",
      courses: randomCourses,
    });
  } catch (err) {
    console.error("Delete course error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while deleting course.",
      error: err.message,
    });
  }
});

superAdminRouter.post("/searchCourse", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        success: false,
        message: "Search query is required and must be a string.",
      });
    }

    const regex = new RegExp(query, "i"); // Case-insensitive partial match

    const results = await Course.find({
      $or: [{ courseTitle: regex }, { courseCode: regex }],
    }).limit(20); // limit for performance

    res.status(200).json({ success: true, results });
  } catch (error) {
    console.error("Error searching for courses:", error);
    res.status(500).json({
      success: false,
      message: "Server error while searching courses.",
    });
  }
});

superAdminRouter.get("/getAdmins", async (req, res) => {
  try {
    const admins = await User.find({ accountType: "admin" }).select(
      "firstName lastName email idNumber"
    );

    const adminDetails = await Promise.all(
      admins.map(async (admin) => {
        const resultCount = await Result.countDocuments({
          uploadedBy: admin?._id,
        });

        const approvedCoursesCount = await PrivilegeRequest.countDocuments({
          lecturer: admin?._id,
          status: "approved",
        });

        return {
          id: admin?._id,
          name: `${admin?.firstName ?? ""} ${admin?.lastName ?? ""}`.trim(),
          email: admin?.email ?? "",
          idNumber: admin?.idNumber ?? "",
          resultsUploaded: resultCount,
          approvedCourses: approvedCoursesCount,
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: "All admin details fetched successfully.",
      admins: adminDetails,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message ?? "Internal server error",
    });
  }
});

superAdminRouter.post("/searchAdmins", async (req, res) => {
  try {
    const { term } = req.body;

    if (!term?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Search term is required.",
      });
    }

    const regex = new RegExp(term.trim(), "i"); // Case-insensitive regex

    const admins = await User.find({
      accountType: "admin",
      $or: [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { idNumber: regex },
      ],
    }).select("firstName lastName email idNumber");

    const adminDetails = await Promise.all(
      admins.map(async (admin) => {
        const resultCount = await Result.countDocuments({
          uploadedBy: admin?._id,
        });

        const approvedCoursesCount = await PrivilegeRequest.countDocuments({
          lecturer: admin?._id,
          status: "approved",
        });

        return {
          id: admin?._id,
          name: `${admin?.firstName ?? ""} ${admin?.lastName ?? ""}`.trim(),
          email: admin?.email ?? "",
          idNumber: admin?.idNumber ?? "",
          resultsUploaded: resultCount,
          approvedCourses: approvedCoursesCount,
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: "Admins fetched successfully.",
      admins: adminDetails,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Internal server error",
    });
  }
});

// --- Get All Pending and In-Progress Complaints (Admin/Super Admin View) ---
superAdminRouter.get("/allComplaints", async (req, res) => {
  try {
    const complaints = await StudentComplaint.find({
      status: { $in: ["pending", "in progress"] },
    })
      .populate("student", "firstName lastName email idNumber")
      .populate("course", "courseCode courseTitle")
      .sort({ createdAt: -1 });

    // Add fullName to each complaint's student
    const complaintsWithFullName = complaints.map((complaint) => {
      const student = complaint.student;
      const fullName = `${student.firstName} ${student.lastName}`;

      return {
        ...complaint._doc,
        student: {
          ...student._doc,
          fullName,
        },
      };
    });

    res.status(200).json({
      message: "Pending and in-progress complaints fetched successfully",
      complaints: complaintsWithFullName,
      success: true,
    });
  } catch (err) {
    console.error("Error fetching complaints:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update complaint status (Only by Super Admin)
superAdminRouter.post("/updateComplaintStatus", async (req, res) => {
  try {
    console.log(req.body);
    const { userId, complaintId, status } = req.body;

    if (!userId || !complaintId || !status) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate status
    const validStatuses = ["in progress", "resolved", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    // Check if user is a super admin
    const user = await User.findById(userId);
    if (!user || user.accountType !== "superAdmin") {
      return res.status(403).json({ error: "Unauthorized access" });
    }

    // Update complaint status
    const updatedComplaint = await StudentComplaint.findByIdAndUpdate(
      complaintId,
      { status },
      { new: true }
    )
      .populate("student", "fullName email idNumber")
      .populate("course", "title code");

    if (!updatedComplaint) {
      return res.status(404).json({ error: "Complaint not found" });
    }

    const allNewComplants = await StudentComplaint.find({
      status: { $in: ["pending", "in progress"] },
    });

    res.status(200).json({
      message: "Complaint status updated successfully",
      complaint: allNewComplants,
      success: true,
    });
  } catch (err) {
    console.error("Error updating complaint:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Route to Add an Event ---
superAdminRouter.post("/add-event", async (req, res) => {
  try {
    console.log(req.body)
    const { date, text, location } = req.body;

    if (!date || !text || !location) {
      return res.status(400).json({
        message: "All fields (date, text, location) are required",
      });
    }

    const newEvent = new Event({ date, text, location });
    await newEvent.save();

    const allEvents = await Event.find().sort({ date: 1 });

    res.status(201).json({
      message: "Event added successfully",
      addedEvent: newEvent,
      allEvents,
      success: true,
    });
  } catch (err) {
    console.error("Add Event Error:", err);
    res.status(500).json({ message: "Failed to add event" });
  }
});


// --- Route to Delete an Event ---
superAdminRouter.post("/deleteEvent", async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    const deletedEvent = await Event.findByIdAndDelete(id);

    if (!deletedEvent) {
      return res.status(404).json({ message: "Event not found" });
    }

    const allEvents = await Event.find().sort({ date: 1 });

    res.json({
      success: true,
      message: "Event deleted successfully",
      deletedEvent,
      allEvents,
    });
  } catch (err) {
    console.error("Delete Event Error:", err);
    res.status(500).json({ message: "Failed to delete event" });
  }
});

// --- Route to Get All Events ---
superAdminRouter.get("/events", async (req, res) => {
  try {
    const allEvents = await Event.find().sort({ date: 1 });
    res.json({allEvents,success:true});
  } catch (err) {
    console.error("Get Events Error:", err);
    res.status(500).json({ success: true, message: "Failed to fetch events" });
  }
});

module.exports = { superAdminRouter };
