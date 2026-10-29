/*
 * Sample frontend catalog for the LMS prototype.
 * Replace the sample values and empty Google Forms URLs when real course data exists.
 * This file does not connect to a server or save data permanently.
 */
window.courseCatalog = [
    {
        id: "foundations-of-design",
        title: "Foundations of Design",
        description: "Explore shape, color, and the ideas behind thoughtful design.",
        icon: "✳",
        instructor: { name: "Maya Patel", photo: "" },
        resources: [
            { title: "Design Fundamentals", type: "Book", filename: "design-fundamentals.pdf", url: "" },
            { title: "Workshop Notes", type: "Lecture notes", filename: "workshop-notes.pdf", url: "" },
            { title: "Design Resources", type: "Supplementary material", filename: "design-resources.pdf", url: "" },
            { title: "Reading List", type: "Revision notes", filename: "reading-list.pdf", url: "" }
        ],
        assignments: [
            { id: "design-visual-analysis", title: "Visual Analysis Essay", description: "Choose a designed object and explain how its form, materials, and color choices affect its meaning.", due: "Nov 12, 2026 · 11:59 PM", marks: 20, status: "Pending", referenceFiles: [] },
            { id: "design-inspiration-board", title: "Design Inspiration Board", description: "Create a board of visual references and add a short note explaining your selections.", due: "Nov 19, 2026 · 11:59 PM", marks: 15, status: "Submitted", referenceFiles: [] },
            { id: "design-project-proposal", title: "Final Project Proposal", description: "Outline your project idea, intended audience, and the design questions you want to explore.", due: "Dec 2, 2026 · 11:59 PM", marks: 25, status: "Overdue", referenceFiles: [] }
        ],
        quizzes: [
            { id: "design-principles-quiz", title: "Design Principles Quiz", description: "Review the core principles and examples from class.", instructions: "Read the design principles notes before starting. Google Forms will handle quiz answers and results.", questions: 10, timeLimit: "15 minutes", due: "Nov 15, 2026", status: "Available", formUrl: "" },
            { id: "color-theory-quiz", title: "Color Theory Quiz", description: "Explore color theory concepts and practical applications.", instructions: "Complete independently. Your responses are handled by the linked Google Form when one is configured.", questions: 8, timeLimit: "12 minutes", due: "Nov 22, 2026", status: "Available", formUrl: "" },
            { id: "typography-quiz", title: "Typography Quiz", description: "Assess your knowledge of type systems and hierarchy.", instructions: "Review the typography resources first. Quiz link has not been configured yet.", questions: 12, timeLimit: "20 minutes", due: "Nov 29, 2026", status: "Coming soon", formUrl: "" }
        ],
        attendance: [
            { studentId: "demo-student", courseId: "foundations-of-design", date: "2026-09-02", topic: "Visual language", status: "Present", remarks: "" },
            { studentId: "demo-student", courseId: "foundations-of-design", date: "2026-09-09", topic: "Shape and form", status: "Present", remarks: "" },
            { studentId: "demo-student", courseId: "foundations-of-design", date: "2026-09-16", topic: "Color foundations", status: "Absent", remarks: "" },
            { studentId: "demo-student", courseId: "foundations-of-design", date: "2026-09-23", topic: "Composition", status: "Present", remarks: "" },
            { studentId: "demo-student", courseId: "foundations-of-design", date: "2026-09-30", topic: "Typography", status: "Present", remarks: "" },
            { studentId: "demo-student", courseId: "foundations-of-design", date: "2026-10-07", topic: "Design systems", status: "Late", remarks: "" },
            { studentId: "demo-student", courseId: "foundations-of-design", date: "2026-10-14", topic: "Material studies", status: "Present", remarks: "" },
            { studentId: "demo-student", courseId: "foundations-of-design", date: "2026-10-21", topic: "Visual hierarchy", status: "Present", remarks: "" },
            { studentId: "demo-student", courseId: "foundations-of-design", date: "2026-10-22", topic: "Critique studio", status: "Absent", remarks: "" },
            { studentId: "demo-student", courseId: "foundations-of-design", date: "2026-10-23", topic: "Design in context", status: "Present", remarks: "" }
        ]
    },
    {
        id: "the-living-planet", title: "The Living Planet", description: "Discover the ecosystems and life forms around us.", icon: "❋",
        instructor: { name: "Arjun Mehta", photo: "" },
        resources: [
            { title: "Ecology Essentials", type: "Book", filename: "ecology-essentials.pdf", url: "" },
            { title: "Ecosystem Lecture Notes", type: "Lecture notes", filename: "ecosystem-notes.pdf", url: "" },
            { title: "Field Study Guide", type: "Supplementary material", filename: "field-study-guide.pdf", url: "" }
        ],
        assignments: [
            { id: "planet-habitat-journal", title: "Habitat Journal", description: "Observe a local habitat and record the organisms and relationships you notice.", due: "Nov 14, 2026 · 11:59 PM", marks: 20, status: "Pending", referenceFiles: [] },
            { id: "planet-food-web", title: "Food Web Diagram", description: "Map the flow of energy through a selected ecosystem.", due: "Nov 25, 2026 · 11:59 PM", marks: 15, status: "Pending", referenceFiles: [] }
        ],
        quizzes: [{ id: "planet-ecosystems-quiz", title: "Ecosystems Check-in", description: "Check your understanding of ecosystem relationships.", instructions: "Review the ecology notes before starting.", questions: 10, timeLimit: "15 minutes", due: "Nov 20, 2026", status: "Available", formUrl: "" }],
        attendance: sampleAttendance("the-living-planet", ["Present", "Present", "Absent", "Present", "Late", "Present", "Present", "Absent", "Present", "Present"])
    },
    {
        id: "stories-and-storytelling", title: "Stories & Storytelling", description: "Learn how stories connect people across time and place.", icon: "❞",
        instructor: { name: "Leah Thomas", photo: "" },
        resources: [{ title: "Story Structures", type: "Book", filename: "story-structures.pdf", url: "" }, { title: "Narrative Workshop", type: "Lecture notes", filename: "narrative-workshop.pdf", url: "" }, { title: "Reading Collection", type: "Supplementary material", filename: "reading-collection.pdf", url: "" }],
        assignments: [{ id: "stories-memory", title: "A Place Remembered", description: "Write a short narrative shaped around a place that matters to you.", due: "Nov 16, 2026 · 11:59 PM", marks: 20, status: "Submitted", referenceFiles: [] }, { id: "stories-story-map", title: "Story Map", description: "Map the turning points and character changes in a story of your choice.", due: "Nov 27, 2026 · 11:59 PM", marks: 15, status: "Pending", referenceFiles: [] }],
        quizzes: [{ id: "stories-narrative-quiz", title: "Narrative Elements Quiz", description: "Review character, setting, conflict, and point of view.", instructions: "Complete the quiz using the configured Google Form when available.", questions: 8, timeLimit: "12 minutes", due: "Nov 23, 2026", status: "Available", formUrl: "" }],
        attendance: sampleAttendance("stories-and-storytelling", ["Present", "Absent", "Absent", "Present", "Present", "Late", "Present", "Absent", "Present", "Present"])
    },
    {
        id: "numbers-in-nature", title: "Numbers in Nature", description: "Find the patterns and math hidden in the natural world.", icon: "∿",
        instructor: { name: "Noah Williams", photo: "" },
        resources: [{ title: "Patterns and Ratios", type: "Book", filename: "patterns-ratios.pdf", url: "" }, { title: "Nature Data Notes", type: "Lecture notes", filename: "nature-data.pdf", url: "" }],
        assignments: [{ id: "numbers-pattern-study", title: "Pattern Study", description: "Document a pattern in nature and describe the numbers or relationships behind it.", due: "Nov 18, 2026 · 11:59 PM", marks: 20, status: "Pending", referenceFiles: [] }, { id: "numbers-field-record", title: "Field Record", description: "Collect a small set of observations and present them clearly.", due: "Dec 1, 2026 · 11:59 PM", marks: 15, status: "Overdue", referenceFiles: [] }],
        quizzes: [{ id: "numbers-pattern-quiz", title: "Patterns Quiz", description: "Try questions about ratios, sequences, and natural patterns.", instructions: "Use the course notes as a review before starting.", questions: 12, timeLimit: "20 minutes", due: "Nov 26, 2026", status: "Available", formUrl: "" }],
        attendance: sampleAttendance("numbers-in-nature", ["Present", "Absent", "Absent", "Present", "Absent", "Late", "Present", "Absent", "Present", "Absent"])
    },
    {
        id: "everyday-astronomy", title: "Everyday Astronomy", description: "Take a closer look at the night sky and our place in it.", icon: "✦",
        instructor: { name: "Sara Khan", photo: "" },
        resources: [{ title: "The Night Sky", type: "Book", filename: "night-sky.pdf", url: "" }, { title: "Moon Phases Notes", type: "Revision notes", filename: "moon-phases.pdf", url: "" }, { title: "Observation Guide", type: "Supplementary material", filename: "observation-guide.pdf", url: "" }],
        assignments: [{ id: "astronomy-moon-log", title: "Moon Observation Log", description: "Record the Moon's appearance on several evenings and reflect on the changes.", due: "Nov 21, 2026 · 11:59 PM", marks: 20, status: "Pending", referenceFiles: [] }, { id: "astronomy-sky-map", title: "Sky Map", description: "Create a simple sky map showing a constellation visible this month.", due: "Dec 4, 2026 · 11:59 PM", marks: 15, status: "Pending", referenceFiles: [] }],
        quizzes: [{ id: "astronomy-solar-system", title: "Solar System Check-in", description: "Review the objects and motions in our solar system.", instructions: "The teacher's Google Form link will be added when ready.", questions: 10, timeLimit: "15 minutes", due: "Nov 28, 2026", status: "Available", formUrl: "" }],
        attendance: sampleAttendance("everyday-astronomy", ["Present", "Present", "Present", "Present", "Absent", "Present", "Late", "Present", "Present", "Present"])
    },
    {
        id: "creative-writing-studio", title: "Creative Writing Studio", description: "Try new ways to shape a thought into a memorable story.", icon: "✎",
        instructor: { name: "Isha Rao", photo: "" },
        resources: [{ title: "Writing Prompts", type: "Book", filename: "writing-prompts.pdf", url: "" }, { title: "Revision Checklist", type: "Revision notes", filename: "revision-checklist.pdf", url: "" }],
        assignments: [{ id: "writing-flash-fiction", title: "Flash Fiction", description: "Write a complete story in a short form, focusing on one clear change or turning point.", due: "Nov 17, 2026 · 11:59 PM", marks: 20, status: "Pending", referenceFiles: [] }, { id: "writing-peer-review", title: "Peer Review Notes", description: "Give constructive feedback on a classmate's draft using the workshop guide.", due: "Nov 30, 2026 · 11:59 PM", marks: 10, status: "Submitted", referenceFiles: [] }],
        quizzes: [{ id: "writing-craft-quiz", title: "Craft and Revision Quiz", description: "Revisit point of view, scene, and revision choices.", instructions: "Please read each prompt carefully. Quiz responses use Google Forms when configured.", questions: 8, timeLimit: "12 minutes", due: "Nov 24, 2026", status: "Available", formUrl: "" }],
        attendance: sampleAttendance("creative-writing-studio", ["Present", "Present", "Absent", "Present", "Present", "Present", "Absent", "Present", "Present", "Late"])
    },
    {
        id: "digital-thinking", title: "Digital Thinking", description: "Build useful habits for solving problems with technology.", icon: "⌘",
        instructor: { name: "Ethan Chen", photo: "" },
        resources: [{ title: "Digital Skills Handbook", type: "Book", filename: "digital-skills.pdf", url: "" }, { title: "Problem-solving Notes", type: "Lecture notes", filename: "problem-solving.pdf", url: "" }, { title: "Workshop Slides", type: "Presentation", filename: "workshop-slides.pdf", url: "" }],
        assignments: [{ id: "digital-process-map", title: "Process Map", description: "Draw a clear process map for a common task and identify possible improvements.", due: "Nov 20, 2026 · 11:59 PM", marks: 20, status: "Pending", referenceFiles: [] }, { id: "digital-reflection", title: "Digital Habits Reflection", description: "Reflect on one digital habit and propose a practical change.", due: "Dec 3, 2026 · 11:59 PM", marks: 15, status: "Pending", referenceFiles: [] }],
        quizzes: [{ id: "digital-thinking-quiz", title: "Digital Thinking Check-in", description: "Review safe, thoughtful, and effective use of digital tools.", instructions: "The configured Google Form opens in a new tab. Your answers are not stored by this prototype.", questions: 10, timeLimit: "15 minutes", due: "Nov 27, 2026", status: "Available", formUrl: "" }],
        attendance: sampleAttendance("digital-thinking", ["Present", "Present", "Present", "Present", "Present", "Late", "Present", "Present", "Present", "Absent"])
    },
    {
        id: "history-around-us", title: "History Around Us", description: "See how the past continues to shape our everyday lives.", icon: "◷",
        instructor: { name: "Amara Johnson", photo: "" },
        resources: [{ title: "Reading the Past", type: "Book", filename: "reading-the-past.pdf", url: "" }, { title: "Local History Notes", type: "Lecture notes", filename: "local-history.pdf", url: "" }, { title: "Archive Worksheet", type: "Worksheet", filename: "archive-worksheet.pdf", url: "" }],
        assignments: [{ id: "history-object-story", title: "An Object's Story", description: "Research an everyday object and describe what it can tell us about a time or community.", due: "Nov 22, 2026 · 11:59 PM", marks: 20, status: "Pending", referenceFiles: [] }, { id: "history-source-notes", title: "Source Notes", description: "Compare two sources and note what each reveals and leaves out.", due: "Dec 5, 2026 · 11:59 PM", marks: 15, status: "Pending", referenceFiles: [] }],
        quizzes: [{ id: "history-sources-quiz", title: "Historical Sources Quiz", description: "Think about evidence, context, and perspective.", instructions: "Review the source analysis notes before opening the Google Form.", questions: 10, timeLimit: "15 minutes", due: "Nov 30, 2026", status: "Available", formUrl: "" }],
        attendance: sampleAttendance("history-around-us", ["Absent", "Present", "Absent", "Present", "Present", "Absent", "Present", "Present", "Absent", "Present"])
    }
];

function sampleAttendance(courseId, statuses) {
    const topics = ["Course introduction", "Key ideas", "Reading workshop", "Case study", "Group discussion", "Research methods", "Source review", "Studio session", "Reflection", "Course review"];
    return statuses.map((status, index) => ({
        studentId: "demo-student",
        courseId,
        date: `2026-09-${String(2 + index * 2).padStart(2, "0")}`,
        topic: topics[index],
        status,
        remarks: ""
    }));
}
