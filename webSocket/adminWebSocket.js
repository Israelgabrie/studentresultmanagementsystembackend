const {
    PrivilegeRequest,
    Course,
    User
  } = require("../databaseConnection");
  


  async function getCourseRequests(id, callback) {
    try {
      const requests = await PrivilegeRequest.find({ lecturer: id });
      callback({ success: true, requests,message:"Course Request Successful" });
    } catch (error) {
      console.error("Error fetching course requests:", error);
      callback({ success: false, message: "Error fetching course requests" });
    }
  }

  async function getAllCourses(callback) {
    try {
      const courses = await Course.find({});
      callback({ success: true, courses });
    } catch (error) {
      console.error("Error fetching courses:", error);
      callback({ success: false, message: error.message });
    }
  }

  async function removeCourseRequest(userId, courseCode, callback) {
    try {
      const course = await Course.findOne({ courseCode: courseCode });
      if (!course) {
        return callback({ success: false, message: "Course not found" });
      }
  
      const deleted = await PrivilegeRequest.findOneAndDelete({
        lecturer: userId,
        course: course._id,
        status: "pending", // only allow deletion of pending requests
      });
  
      if (!deleted) {
        return callback({ success: false, message: "Request not found or already approved"  });
      }

      const requests = await PrivilegeRequest.find({ lecturer: userId });  

      callback({ success: true, message: "Request successfully removed" ,requests:requests });
    } catch (error) {
      console.error("Error removing request:", error);
      callback({ success: false, message: error.message });
    }
  }
  


  async function getAllCourseRequests(userId, callback) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return callback({ success: false, message: "User not found" });
      }
  
      if (user.accountType !== "superAdmin") {
        return callback({ success: false, message: "Unauthorized" });
      }
  
      // Fetch all privilege requests and populate related data
      const rawRequests = await PrivilegeRequest.find({})
        .populate("course", "courseCode courseTitle")
        .populate("lecturer", "firstName lastName email");
  
      // Add `.name` property for easier frontend rendering
      const requests = rawRequests.map((req) => {
        const name = req.lecturer ? `${req.lecturer.firstName} ${req.lecturer.lastName}` : "Unknown";
        return {
          ...req._doc, // spread all original properties
          name, // add custom name
        };
      });
  
      return callback({ success: true, requests ,message:"Request Collected Sussfully" });
    } catch (error) {
      console.error("Error getting all course requests:", error);
      return callback({ success: false, message: error.message });
    }
  }

  
  
  
  
  module.exports = {
    getAllCourses,
    getCourseRequests,
    removeCourseRequest,
    getAllCourseRequests
  };
  