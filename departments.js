//This is the file that contains all the departments and the programme under each of them
const departments = [
    {
        name: "Computer Science and Mathematics",
        Programmes: [
            "Software Engineering",
            "Computer Science",
            "Cyber Security",
            "Mathematics"
        ],
        courses: [
            { courseCode: "CSC101", courseTitle: "Introduction to Computer Science" },
            { courseCode: "CSE 201", courseTitle: "Introduction to Software Engineering" },
            { courseCode: "CSE 202", courseTitle: "Computer Programing II" },
            { courseCode: "CSE 203", courseTitle: "Discrete Structure" },
            { courseCode: "CSE 204", courseTitle: "Logic and its Application in Computer Science" },
            { courseCode: "CSE 205", courseTitle: "Software Requirements and Design" },
            { courseCode: "CSE 206", courseTitle: "Software Construction" },
            { courseCode: "CSE 207", courseTitle: "Computer Architecture and Organization" },
            { courseCode: "CSE 208", courseTitle: "Design and Analysis of Computer Algorithms" },
            { courseCode: "CSE 209", courseTitle: "Data Structure & Algorithm" },
            { courseCode: "CSE 210", courseTitle: "Operating Systems I" },
            { courseCode: "CSE 212", courseTitle: "Software Engineering" },
            { courseCode: "CSE 401", courseTitle: "Software Configuration Management and Maintenance" },
            { courseCode: "CSE 403", courseTitle: "Software Engineering Project Management" },
            { courseCode: "CSE 405", courseTitle: "Research Methodology" },
            { courseCode: "CSE 407", courseTitle: "Software Engineering Professional Practice" },
            { courseCode: "CSE 409", courseTitle: "Software Engineering Security" },
            { courseCode: "CSE 411", courseTitle: "Seminar" },
            { courseCode: "CSE 413", courseTitle: "Artificial Intelligence" },
            { courseCode: "CSC417", courseTitle: "Mobile Design and Developments" },
            { courseCode: "MTH101", courseTitle: "Elementary Mathematics II" },
            { courseCode: "MTH 202", courseTitle: "Linear Algebra II" },
            { courseCode: "MTH 203", courseTitle: "Linear Algebra I" },
        ]
    },
    {
        name: "Biological Science",
        Programmes: [
            "Microbiology",
            "Biology",
            "Biotechnology"
        ],
        courses: [
            { courseCode: "BIO101", courseTitle: "General Biology I" },
            { courseCode: "BIO103", courseTitle: "Practical Biology I" }
        ]
    },
    {
        name: "Chemistry",
        Programmes: [
            "Chemistry",
            "Industrial Chemistry"
        ],
        courses: [
            { courseCode: "CHM101", courseTitle: "General Chemistry I" },
            { courseCode: "CHM103", courseTitle: "Practical Chemistry I" }
        ]
    },
    {
        name: "Biochemistry",
        Programmes: ["Biochemistry"],
        courses: [
            { courseCode: "BCH 388", courseTitle: "SIWES" }
        ]
    },
    {
        name: "Physics",
        Programmes: [
            "Physics",
            "Physics with Electronics",
            "Applied Geophysics"
        ],
        courses: [
            { courseCode: "PHY101", courseTitle: "General Physics I" },
            { courseCode: "PHY103", courseTitle: "General Physics III" },
            { courseCode: "PHY 202", courseTitle: "Electric Circuits and Electronics" }
        ]
    },
    {
        name: "Food Science",
        Programmes: ["Food Science and Technology"]
    },
    {
        name: "Geosciences",
        Programmes: ["Geology"]
    },
    {
        name: "Management Sciences",
        Programmes: [
            "Accounting",
            "Finance",
            "Business Administration",
            "Public Administration",
            "Industrial Relations & Personal Management",
            "Securities and Investment"
        ]
    },
    {
        name: "Social Sciences",
        Programmes: ["Economics"]
    },
    {
        name: "Mass Communication",
        Programmes: ["Mass Communication"]
    },
    {
        name: "Languages and Communication Studies",
        Programmes: [],
        courses: [
            { courseCode: "GST101", courseTitle: "Communication in English I" },
            { courseCode: "GST103", courseTitle: "Nigerian Peoples and Cultures" },
            { courseCode: "GST105", courseTitle: "Use of Library, Study Skills & Information Communication Technology" },
            { courseCode: "GST106", courseTitle: "Logic, Philosophy, and Human Existence" },
            { courseCode: "GST201", courseTitle: "Introduction to Entrepreneurship Studies" },
            { courseCode: "GST202", courseTitle: "Peace Studies and Conflict Studies" },
            { courseCode: "GST205", courseTitle: "Environment & Sustainable Development" },
            { courseCode: "GST208", courseTitle: "Foundation course in Entrepreneurship" },
            { courseCode: "PIF101", courseTitle: "Introduction to Communication in French" },
            { courseCode: "PIF201", courseTitle: "Proficiency in French 1" },
            { courseCode: "PIF202", courseTitle: "Proficiency in French 2" }
        ]
    },
    {
        name: "Religious Studies",
        Programmes: ["Religious Studies"],
        courses: [
            { courseCode: "SDN101", courseTitle: "Success Dynamics I" },
            { courseCode: "SDN201", courseTitle: "Bible Doctrine I" },
            { courseCode: "SDN202", courseTitle: "Bible Doctrine II" }
        ]
    },
    {
        name: "Arts and Humanities",
        Programmes: [
            "English",
            "Fine and Applied Arts",
            "Music",
            "Religious Studies"
        ]
    }
];

module.exports = { departments };
