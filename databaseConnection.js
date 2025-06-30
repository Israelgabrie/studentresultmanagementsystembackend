const mongoose = require("mongoose");
require("dotenv").config();

// --- 1. User Schema ---
const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    idNumber: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    accountType: { type: String, enum: ['student', 'admin', 'superAdmin'], required: true },
    department: { type: String }, // <- Add this
    programme: { type: String },  // <- Add this
    session: { type: String },
    blocked:{type : Boolean ,default:false}

  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

// --- 2. Department Schema ---
const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    programmes: [{ type: String }],
  },
  { timestamps: true }
);

const Department = mongoose.model("Department", departmentSchema);

// --- 3. Course Schema ---
const courseSchema = new mongoose.Schema(
  {
    courseCode: { type: String, required: true, unique: true },
    courseTitle: { type: String, required: true },
  },
  { timestamps: true }
);

const Course = mongoose.model("Course", courseSchema);

// --- 4. PrivilegeRequest Schema ---
const privilegeRequestSchema = new mongoose.Schema(
  {
    lecturer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    requestedAt: { type: Date, default: Date.now },
    courseCode: { type: String, required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // superadmin
  },
  { timestamps: true }
);

const PrivilegeRequest = mongoose.model(
  "PrivilegeRequest",
  privilegeRequestSchema
);



// --- 5. Result Schema (with test and exam scores) ---
const resultSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    testScore: { type: Number},
    examScore: { type: Number},
    totalScore: { type: Number, required: true },
    unit: { type: Number, required: true },
    grade: { type: String, required: true },
    semester: { type: String, required: true },
    session: { type: String, required: true },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    uploadedAt: { type: Date, default: Date.now },
    approved: { type: Boolean, default: false }, // Added approval field
    approvedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: false 
    }, // Super Admin who approves the result
    approvedAt: { type: Date, required: false } // Timestamp for approval
  },
  { timestamps: true }
);

const Result = mongoose.model("Result", resultSchema);

// --- 6. SemesterSession Schema (optional) ---
const semesterSessionSchema = new mongoose.Schema(
  {
    semester: { type: String, required: true }, // 'First' | 'Second'
    session: { type: String, required: true }, // e.g. '2024/2025'
    isActive: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const SemesterSession = mongoose.model(
  "SemesterSession",
  semesterSessionSchema
);


// --- 7. Course Feedback Schema ---
const courseFeedbackSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    session: { type: String, required: true }, // e.g. '2023/2024'
    text: { type: String, required: true },  // The actual feedback text
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

const CourseFeedback = mongoose.model("CourseFeedback", courseFeedbackSchema);

// --- Database Connection ---
async function startConnection() {
  try {
    const uri = process.env.DATABASE_CONNECTION_STRING;
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected");
    return true;
  } catch (err) {
    console.error("DB connection error:", err);
    return false;
  }
}


// --- 8. Student Complaint Schema ---
const studentComplaintSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    complaintType: {
      type: String,
      enum: ["missing result", "system error", "wrong grade", "other"],
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: false, // may not apply to all types of complaints
    },
    description: {
      type: String,
      required: true,
    },
    proofFileUrl: {
      type: String,
      required: false, // Only for complaints like 'missing result'
    },
    status: {
      type: String,
      enum: ["pending", "in progress", "resolved", "rejected"],
      default: "pending",
    },
    assignedAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // to be assigned by system or manually later
    },
    session: {
      type: String,
      required: false,
    },
    semester: {
      type: String,
      required: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const StudentComplaint = mongoose.model("StudentComplaint", studentComplaintSchema);

// --- 9. Event Schema ---
const eventSchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, 
    text: { type: String, required: true },
    location: { type: String, required: true },
  },
  { timestamps: true }
);

const Event = mongoose.model("Event", eventSchema);


module.exports = {
  StudentComplaint,
  startConnection,
  User,
  Department,
  Course,
  PrivilegeRequest,
  Result,
  SemesterSession,
  CourseFeedback,
  Event
};
