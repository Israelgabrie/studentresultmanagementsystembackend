const express = require("express");
const app = express();
require('dotenv').config();
const PORT = process.env.PORT_NUMBER || 3000;
const startConnection = require("./databaseConnection").startConnection;
const userRouter = require("./users/api").userRouter
app.use(express.json()); // Parses JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parses URL-encoded data (form submissions)
const cors = require("cors");
const department = require("./departments").departments


// Enable CORS for all routes
app.use(cors({
    origin:["http://localhost:5173"], // Allow requests from this origin
    credentials:true, // Allow credentials (cookies, authorization headers, etc.)
    methods:["GET","POST","PUT","DELETE"],
    allowedHeaders: ['Content-Type', 'Authorization'], // Allow these headers
}));

//middleware to enbale the user router
app.use("/user",userRouter);

// api to get avalilable departments
app.get("/getDepartment",(req,res)=>{
   try{
    res.send({success:true,message:"departments retrived successfully",department:department})
   }catch(error){
    res.send({success:false,message:"failed to retrived department",department:[]})
   }
})



async function startServer() {
    const isConnected = await startConnection(); // Wait for DB connection
    if (!isConnected) {
        console.error("Server startup aborted due to database connection failure.");
        process.exit(1); // Stop the process if the database connection fails
    }

    app.listen(PORT, () => {
        console.log("Server is running on port " + PORT);
    });
}

startServer();
