"use strict";

const courses = window.courseCatalog;

const courseGrid = document.querySelector("#courseGrid");
const courseCount = document.querySelector("#courseCount");
// const courseDialog = document.querySelector("#courseDialog");
// const courseForm = document.querySelector("#courseForm");
// const resourceList = document.querySelector("#resourceList");
// const formMessage = document.querySelector("#formMessage");
// const coverInput = document.querySelector("#coverImage");
// let resourceId = 0;

function renderCourses() {
    courseGrid.replaceChildren();
    courses.forEach((course, index) => {
        const card = document.createElement("article");
        card.className = "course-card";
        const top = document.createElement("div");
        top.className = "course-topline";
        const number = document.createElement("span");
        number.className = "course-number";
        number.textContent = `COURSE ${String(index + 1).padStart(2, "0")}`;
        top.append(number);
        card.append(top);

        if (course.coverUrl) {
            card.classList.add("has-cover");
            const img = document.createElement("img");
            img.className = "cover-thumb";
            img.src = course.coverUrl;
            img.alt = `${course.title} cover`;
            card.append(img);
        } else {
            const icon = document.createElement("span");
            icon.className = "course-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.textContent = course.icon || "✳";
            card.append(icon);
        }

        const title = document.createElement("h3");
        title.textContent = course.title;
        const description = document.createElement("p");
        description.textContent = course.description;
        const open = document.createElement("button");
        open.className = "course-open";
        open.type = "button";
        open.setAttribute("aria-label", `Open ${course.title}`);
        open.innerHTML = "<span>Open course</span><span aria-hidden=\"true\">→</span>";
        open.addEventListener("click", () => {
        window.location.href =
            `course_details.html?course=${encodeURIComponent(course.id)}`;
        });
        card.append(title, description, open);
        courseGrid.append(card);
    });

    // const addCard = document.createElement("button");
    // addCard.className = "add-course-card";
    // addCard.type = "button";
    // addCard.innerHTML = '<span class="add-course-icon" aria-hidden="true">+</span><strong>Add a course</strong><small>Build a new learning space</small>';
    // addCard.addEventListener("click", openCourseForm);
    // courseGrid.append(addCard);
    courseCount.textContent = `${courses.length} ${courses.length === 1 ? "course" : "courses"}`;
}

// function openCourseForm() {
//     courseForm.reset();
//     resourceList.replaceChildren();
//     formMessage.textContent = "";
//     document.querySelector("#coverFilename").textContent = "Choose an image file";
//     addResourceRow();
//     courseDialog.showModal();
//     document.querySelector("#courseTitle").focus();
// }

// function addResourceRow() {
//     const id = ++resourceId;
//     const row = document.createElement("div");
//     row.className = "resource-row";

//     const nameWrap = document.createElement("div");
//     const nameLabel = document.createElement("label");
//     nameLabel.htmlFor = `resourceName${id}`;
//     nameLabel.textContent = "Resource title";
//     const name = document.createElement("input");
//     name.id = `resourceName${id}`;
//     name.placeholder = "e.g. Week 1 notes";
//         nameWrap.append(nameLabel, name);

//     const typeWrap = document.createElement("div");
//     const typeLabel = document.createElement("label");
//     typeLabel.htmlFor = `resourceType${id}`;
//     typeLabel.textContent = "Type";
//     const type = document.createElement("select");
//     type.id = `resourceType${id}`;
//     ["Book", "Notes", "Presentation", "Assignment", "Worksheet", "Other"].forEach((value) => {
//         const option = document.createElement("option");
//         option.value = value;
//         option.textContent = value;
//         type.append(option);
//     });
//     typeWrap.append(typeLabel, type);

//     const fileWrap = document.createElement("div");
//     fileWrap.className = "resource-file";
//     const fileLabel = document.createElement("label");
//     fileLabel.htmlFor = `resourceFile${id}`;
//     fileLabel.textContent = "File";
//     const file = document.createElement("input");
//     file.id = `resourceFile${id}`;
//     file.type = "file";
//     file.accept = ".pdf,.doc,.docx,.ppt,.pptx,.txt,.rtf,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,image/*,application/zip";
//     const filename = document.createElement("span");
//     filename.className = "resource-filename";
//     filename.textContent = "No file selected";
//     file.addEventListener("change", () => { filename.textContent = file.files[0]?.name || "No file selected"; });
//     fileWrap.append(fileLabel, file, filename);

//     const remove = document.createElement("button");
//     remove.className = "remove-resource";
//     remove.type = "button";
//     remove.setAttribute("aria-label", "Remove this material");
//     remove.textContent = "×";
//     remove.addEventListener("click", () => row.remove());
//     row.append(nameWrap, typeWrap, fileWrap, remove);
//     resourceList.append(row);
// }

// function showCourse(course) {
//     document.querySelector("#detailTitle").textContent = course.title;
//     document.querySelector("#detailDescription").textContent = course.description;
//     const instructor = document.querySelector("#detailInstructor");
//     instructor.textContent = course.instructor ? `Instructor: ${course.instructor}` : "";
//     const list = document.querySelector("#detailResourceList");
//     list.replaceChildren();
//     if (!course.resources?.length) {
//         const empty = document.createElement("p");
//         empty.className = "empty-resources";
//         empty.textContent = "Learning materials will appear here when they are added.";
//         list.append(empty);
//     } else {
//         course.resources.forEach((resource) => {
//             const item = document.createElement("div");
//             item.className = "detail-resource";
//             const label = document.createElement("span");
//             label.textContent = `${resource.type} · ${resource.name || resource.file.name}`;
//             const link = document.createElement("a");
//             link.href = resource.url;
//             link.target = "_blank";
//             link.rel = "noopener";
//             link.textContent = "Open file →";
//             link.setAttribute("aria-label", `Open ${resource.file.name}`);
//             item.append(label, link);
//             list.append(item);
//         });
//     }
//     document.querySelector("#detailDialog").showModal();
// }

// document.querySelector("#addResource").addEventListener("click", addResourceRow);
// coverInput.addEventListener("change", () => {
//     document.querySelector("#coverFilename").textContent = coverInput.files[0]?.name || "Choose an image file";
// });
// document.querySelector("#closeDialog").addEventListener("click", () => courseDialog.close());
// document.querySelector("#cancelDialog").addEventListener("click", () => courseDialog.close());
// document.querySelector("#closeDetail").addEventListener("click", () => document.querySelector("#detailDialog").close());
// document.querySelector("#doneDetail").addEventListener("click", () => document.querySelector("#detailDialog").close());

// courseForm.addEventListener("submit", (event) => {
//     event.preventDefault();
//     if (!courseForm.reportValidity()) return;
//     const coverFile = coverInput.files[0];
//     if (coverFile && !coverFile.type.startsWith("image/")) {
//         formMessage.textContent = "Please choose an image file for the course cover.";
//         return;
//     }
//     const resources = [];
//     for (const row of resourceList.querySelectorAll(".resource-row")) {
//         const fileInput = row.querySelector('input[type="file"]');
//         const nameInput = row.querySelector("input:not([type=file])");
//         const file = fileInput.files[0];
//         const name = nameInput.value.trim();
//         if (file) {
//             resources.push({ name: name || file.name, type: row.querySelector("select").value, file, url: URL.createObjectURL(file) });
//         } else if (name) {
//             formMessage.textContent = `Choose a file for “${name}” or remove that material row.`;
//             return;
//         }
//     }

//     courses.push({
//         title: document.querySelector("#courseTitle").value.trim(),
//         description: document.querySelector("#courseDescription").value.trim(),
//         instructor: document.querySelector("#instructorName").value.trim(),
//         icon: "✳",
//         coverUrl: coverFile ? URL.createObjectURL(coverFile) : "",
//         resources
//     });
//     renderCourses();
//     courseDialog.close();
// });

// // Release local preview URLs when the page is closed. These files are session-only.
// window.addEventListener("beforeunload", () => {
//     courses.forEach((course) => {
//         if (course.coverUrl) URL.revokeObjectURL(course.coverUrl);
//         course.resources?.forEach((resource) => URL.revokeObjectURL(resource.url));
//     });
// });

renderCourses();