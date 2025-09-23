// ===== Firebase設定 =====
const firebaseConfig = {
  apiKey: "AIzaSyD0wN-RlM-i_b2mf6kw7ScWRHW5wLZXrtU",
  authDomain: "my-outline-notes.firebaseapp.com",
  projectId: "my-outline-notes",
  storageBucket: "my-outline-notes.firebasestorage.app",
  messagingSenderId: "897628965124",
  appId: "1:897628965124:web:53dc88da94fa3a658ee851",
  measurementId: "G-DVSK215TBK"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ===== サイドバー =====
const sidebar = document.getElementById("sidebar");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const closeSidebarBtn = document.getElementById("closeSidebar");
const projectList = document.getElementById("projectList");
const newProjectInput = document.getElementById("newProjectName");
const addProjectBtn = document.getElementById("addProject");
const currentProjectTitle = document.getElementById("currentProject");
let currentProject = "default";

toggleSidebarBtn.addEventListener("click", () => sidebar.classList.toggle("show"));
closeSidebarBtn.addEventListener("click", () => sidebar.classList.remove("show"));

// ===== 共通ノード操作関数 =====
function addNode(currentLi) {
  const newLi = createNode("");
  currentLi.insertAdjacentElement("afterend", newLi);
  newLi.querySelector(".text").focus();
}
function indentNode(currentLi) {
  const prev = currentLi.previousElementSibling;
  if (prev) prev.querySelector(".children").appendChild(currentLi);
}
function outdentNode(currentLi) {
  const parentUl = currentLi.parentElement;
  if (parentUl && parentUl.classList.contains("children")) {
    const parentLi = parentUl.closest(".node");
    parentLi.insertAdjacentElement("afterend", currentLi);
  }
}
function deleteNode(currentLi) { currentLi.remove(); }

// ===== ノード生成 =====
function createNode(text, children = []) {
  const li = document.createElement("li");
  li.className = "node";
  li.innerHTML = `
    <div class="content">
      <button class="toggle">▶</button>
      <span class="text" contenteditable="true">${text}</span>
      <button class="enterBtn">↩</button>
    </div>
    <ul class="children"></ul>
  `;
  const childrenUl = li.querySelector(".children");
  children.forEach(child => childrenUl.appendChild(createNode(child.text, child.children)));

  // ↩ボタン（スマホ用）
  li.querySelector(".enterBtn").addEventListener("click", () => addNode(li));

  return li;
}

// ===== PC: キーボード操作 =====
const outline = document.getElementById("outline");
outline.addEventListener("keydown", e => {
  const li = e.target.closest(".node");
  if (!li) return;

  if (e.key === "Enter") {
    e.preventDefault();
    addNode(li);
  } else if (e.key === "Tab" && !e.shiftKey) {
    e.preventDefault();
    indentNode(li);
  } else if (e.key === "Tab" && e.shiftKey) {
    e.preventDefault();
    outdentNode(li);
  } else if ((e.key === "Backspace" || e.key === "Delete") &&
             li.querySelector(".text").textContent.trim() === "") {
    e.preventDefault();
    deleteNode(li);
  }
});

// ===== スマホ: スワイプ操作 =====
let startX = 0;

outline.addEventListener("touchstart", e => {
  const li = e.target.closest(".node");
  if (!li) return;
  const content = li.querySelector(".content");
  startX = e.touches[0].clientX;
  content.style.transition = "none"; // 行本体だけ動かす
});

outline.addEventListener("touchmove", e => {
  const li = e.target.closest(".node");
  if (!li) return;
  const content = li.querySelector(".content");
  const diff = e.touches[0].clientX - startX;

  content.style.transform = `translateX(${diff}px)`;

  // 削除候補のとき赤背景
  if (diff < -120) {
    content.style.background = "#f8d7da";
  } else {
    content.style.background = ""; // 元に戻す
  }
});

outline.addEventListener("touchend", e => {
  const li = e.target.closest(".node");
  if (!li) return;
  const content = li.querySelector(".content");
  const diff = e.changedTouches[0].clientX - startX;

  if (diff > 30) {
    indentNode(li);
  } else if (diff < -120) {
    deleteNode(li);
  } else if (diff < -30) {
    outdentNode(li);
  }

  // 戻す
  content.style.transition = "transform 0.2s ease";
  content.style.transform = "translateX(0)";
  content.style.background = ""; // 背景リセット
});


// ===== JSON変換 =====
function nodeToJson(li) {
  const text = li.querySelector(".text").textContent;
  const children = Array.from(li.querySelector(".children").children).map(nodeToJson);
  return { text, children };
}
function jsonToNode(data) { return createNode(data.text, data.children); }

// ===== Firestore 同期 =====
async function loadProjects() {
  projectList.innerHTML = "";
  const snapshot = await db.collection("projects").get();
  if (snapshot.empty) {
    await db.collection("projects").doc("default").set({ name: "default" });
    addProject("default");
    currentProject = "default";
    currentProjectTitle.textContent = "default";
    await loadOutlineFromCloud("default");
  } else {
    const docs = snapshot.docs;
    docs.forEach(d => addProject(d.id));
    const first = docs[0].id;
    currentProject = first;
    currentProjectTitle.textContent = first;
    const li = Array.from(projectList.children).find(li => li.textContent === first);
    if (li) li.classList.add("active");
    await loadOutlineFromCloud(first);
  }
}
function addProject(name) {
  if (!name) return;
  if (Array.from(projectList.children).some(li => li.dataset.project === name)) return;
  const li = document.createElement("li");
  li.dataset.project = name;
  li.textContent = name;
  li.addEventListener("click", async () => {
    currentProject = name;
    currentProjectTitle.textContent = name;
    document.querySelectorAll("#projectList li").forEach(li => li.classList.remove("active"));
    li.classList.add("active");
    await loadOutlineFromCloud(name);
  });
  projectList.appendChild(li);
}
addProjectBtn.addEventListener("click", async () => {
  const name = newProjectInput.value.trim();
  if (!name) return;
  await db.collection("projects").doc(name).set({ name });
  addProject(name);
  currentProject = name;
  currentProjectTitle.textContent = name;
  newProjectInput.value = "";
  await loadOutlineFromCloud(name);
});
function getCurrentProject() { return currentProject || "default"; }

async function loadOutlineFromCloud(project) {
  try {
    const doc = await db.collection("outlines").doc(project).get();
    outline.innerHTML = "";
    if (doc.exists) {
      const data = doc.data().data;
      data.forEach(item => outline.appendChild(jsonToNode(item)));
    } else {
      outline.appendChild(createNode("メモを書く")); // 新規は初期行
    }
  } catch (err) { console.error(err); alert("読み込み失敗"); }
}
document.getElementById("saveCloud").addEventListener("click", async () => {
  const data = Array.from(outline.children).map(nodeToJson);
  const project = getCurrentProject();
  await db.collection("outlines").doc(project).set({ data });
  alert(`${project} を保存しました`);
});


// ===== 改行禁止部分 =====
let isComposing = false;

// 日本語変換開始
outline.addEventListener("compositionstart", () => {
  isComposing = true;
});

// 日本語変換終了
outline.addEventListener("compositionend", () => {
  isComposing = false;
});

// 改行禁止処理
outline.addEventListener("input", e => {
  if (e.target.classList.contains("text") && !isComposing) {
    e.target.textContent = e.target.textContent.replace(/\n/g, "");
  }
});

// ===== 初期ロード =====
window.addEventListener("DOMContentLoaded", () => {
  sidebar.classList.add("hidden");
  loadProjects();
});

