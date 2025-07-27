const express = require("express");
const app = express();
require('dotenv').config();
const PORT = 4200; // 🔥 Hardcoded to 4200
const startConnection = require("./databaseConnection").startConnection;
const userRouter = require("./users/api").userRouter;
const adminRouter = require("./admin/admin").adminRouter;
const { getAllCourses, getCourseRequests, removeCourseRequest ,getAllCourseRequests} = require("./webSocket/adminWebSocket");
// const department = require("./departments").departments;
const cors = require("cors");
const {superAdminRouter} = require("./superAdminRoutes/superAdminRouter");
const { Department,Course } = require("./databaseConnection");
const { studentRouter } = require("./studentRouter");
const path = require("path");
const fs = require("fs")


// ✅ CORS Configuration
const corsOptions = {
    origin: ["http://localhost:5173"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/user", userRouter);
app.use("/admin", adminRouter);
app.use("/superAdmin",superAdminRouter);
app.use("/student",studentRouter);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));


// Serve the built frontend
app.use(express.static(path.join(__dirname, "dist"))); // or "frontend/dist" if it's inside frontend/



// API route to get departments
app.get("/getDepartment", async(req, res) => {
    try {
        console.log("Fetching departments...");
        const department = await Department.find();
        console.log(department)
        res.send({
            success: true,
            message: "Departments retrieved successfully",
            department: department
        });
    } catch (error) {
        res.send({
            success: false,
            message: "Failed to retrieve departments",
            department: []
        });
    }
});


// Handle SPA (like Angular/React with routing)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});




async function startServer() {
    const isConnected = await startConnection();
    if (!isConnected) {
        console.error("Server startup aborted due to database connection failure.");
        process.exit(1);
    }

    // 🧠 Create HTTP server required for Socket.IO
    const http = require("http");
    const server = http.createServer(app);

    const { Server } = require("socket.io");
    const io = new Server(server, {
        cors: corsOptions
    });

    // 🎯 Setup socket events
    io.on("connection", (socket) => {
        console.log("User connected:", socket.id);

        socket.on("join-admin-room", (adminId) => {
            socket.join(adminId);
            socket.join("adminRoom");
        });

        socket.on("removeCourseRequest",(userId,courseCode,callback)=>{
            removeCourseRequest(userId,courseCode,callback)
        })
        

        socket.on("getAllCourseRequests",(adminId,callback)=>{
            console.log("getAllCourseRequests evenet received")
            getAllCourseRequests(adminId,callback);
        })

        socket.on("getCourseRequests", (requestId, callback) => {
            console.log("all user requests being demanded")
            getCourseRequests(requestId, callback);
        });

        socket.on("getAllCourses", (callback) => {
            getAllCourses(callback);
        });

        socket.on("testEvent",()=>{
            console.log("its workeing")
        })

        socket.on("acceptCourseRequest", (requestId, callback) => {
            
        })

        socket.on("disconnect", () => {
            console.log("User disconnected:", socket.id);
        });
    });

    // 🔥 Start server on port 4200
    server.listen(PORT, () => {
        console.log("Server is running on http://localhost:" + PORT);
    });
}

startServer();
