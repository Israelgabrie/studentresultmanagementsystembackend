const mongoose = require('mongoose'); 
require('dotenv').config();

const userSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    accountType: { type: String, required: true },
    idNumber: { type: String, required: true, unique: true },
    password: { type: String, required: true }
}, { timestamps: true });

const userModel = mongoose.model('User', userSchema); 

async function startConnection() {
    try {
        const connectionString = process.env.DATABASE_CONNECTION_STRING;
        await mongoose.connect(connectionString);
        console.log("MongoDB Connection Successfully");
        return true; 
    } catch (error) {
        console.error(`Error establishing database connection: ${error.message}`);
        return false; 
    }
}

module.exports = { startConnection, userModel }; 
