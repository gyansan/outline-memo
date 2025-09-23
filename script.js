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

// ===== サイドバー & プロジェクト管理 =====
const sidebar = document.getElementById("sidebar");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const closeSidebarBtn = document.getElementById("closeSidebar");
const projectList = document.getElementById("projectList");
const newProjectInput = document.getElementById("newProjectName");
const addProjectBtn = document.getElementById("addProject");
const currentProjectTitle = document.getElementById("currentProject");

let currentProject = "default";

// サイドバー開閉
toggleSidebarBtn.addEventListener("click", () => {
  sidebar.classList.toggle("hidden");
});

// サイドバー閉じる
closeSidebarBtn.addEventListener("click", () => {
  sidebar.classList.add("hidden");
});

// ===== Firestoreからプロジェクト一覧をロード =====
async function loadProjects() {
  projectList.innerHTML = "";
  const snapshot = await db.collection("projects").get();

  if (snapshot.empty) {
    // 初回 default
    await db.collection("projects").doc("default").set({ name: "default" });
    addProject("default");
    currentProject = "default";
    currentProjectTitle.textContent = "default";
    await loadOutlineFromCloud("default");
  } else {
    const docs = snapshot.docs;
    docs.forEach(d => addProject(d.id));
    // 一番上を選択
    const firstProject = docs[0].id;
    currentProject = firstProject;
    currentProjectTitle.textContent = firstProject;
    const li = Array.from(projectList.children).find(li => li.textContent === firstProject);
    if (li) li.classList.add("active");
    await loadOutlineFromCloud(firstProject);
  }
}

// ===== プロジェクト追加処理 =====
addProjectBtn.addEventListener("click", async () => {
  const name = newProjectInput.value.trim();
  if (!name) return;
  try {
    await db.collection("projects").doc(name).set({ name });
    addProject(name);
    currentProject = name;
    currentProjectTitle.textContent = name;
    newProjectInput.value = "";
    await loadOutlineFromCloud(name);
  } catch (err) {
    console.error(err);
    alert("プロジェクト追加に失敗しました");
  }
});

// ===== プロジェクトリストに反映 =====
function addProject(name) {
  if (!name) return;
  if (Array.from(projectList.children).some(li => li.dataset.project === name)) return;

  const li = document.createElement("li");
  li.dataset.project = name;

  const span = document.createElement("span");
  span.textContent = name;
  span.addEventListener("click", async () => {
    currentProject = name;
    currentProjectTitle.textContent = name;
    document.querySelectorAll("#projectList li").forEach(li => li.classList.remove("active"));
    li.classList.add("active");
    await loadOutlineFromCloud(name);
  });

  const delBtn = document.createElement("button");
  delBtn.textContent = "🗑";
  delBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (confirm(`${name} を削除しますか？`)) {
      try {
        await db.collection("projects").doc(name).delete();
        await db.collection("outlines").doc(name).delete();
        li.remove();

        // 削除後の処理
        if (currentProject === name) {
          if (projectList.children.length > 0) {
            const first = projectList.children[0].dataset.project;
            currentProject = first;
            currentProjectTitle.textContent = first;
            projectList.children[0].classList.add("active");
            await loadOutlineFromCloud(first);
          } else {
            await db.collection("projects").doc("default").set({ name: "default" });
            addProject("default");
            currentProject = "default";
            currentProjectTitle.textContent = "default";
            await loadOutlineFromCloud("default");
          }
        }
      } catch (err) {
        console.error(err);
        alert("削除に失敗しました");
      }
    }
  });

  li.appendChild(span);
  li.appendChild(delBtn);
  projectList.appendChild(li);

  if (name === currentProject) li.classList.add("active");
}

function getCurrentProject() {
  return currentProject || "default";
}

// ===== アウトライン本体 =====
const outline = document.getElementById("outline");
const expandAllBtn = document.getElementById("expandAll");
const collapseAllBtn = document.getElementById("collapseAll");
const saveCloudBtn = document.getElementById("saveCloud");

// ノードクリック
outline.addEventListener("click", e => {
  const li = e.target.closest(".node");
  if (!li) return;

  if (e.target.classList.contains("toggle")) {
    const children = li.querySelector(".children");
    if (!children) return;
    children.classList.toggle("hidden");
    e.target.textContent = children.classList.contains("hidden") ? "▶" : "▼";
  }
  if (e.target.classList.contains("add")) {
    const newLi = createNode("");
    li.querySelector(".children").appendChild(newLi);
    newLi.querySelector(".text").focus();
  }
  if (e.target.classList.contains("indent")) {
    const prev = li.previousElementSibling;
    if (prev) prev.querySelector(".children").appendChild(li);
  }
  if (e.target.classList.contains("outdent")) {
    const parentUl = li.parentElement;
    if (parentUl && parentUl.classList.contains("children")) {
      const parentLi = parentUl.closest(".node");
      parentLi.insertAdjacentElement("afterend", li);
    }
  }
  if (e.target.classList.contains("delete")) {
    li.remove();
  }
});

// ノード生成
function createNode(text, children = []) {
  const li = document.createElement("li");
  li.className = "node";
  li.innerHTML = `
    <div class="content">
      <button class="toggle">▶</button>
      <span class="text" contenteditable="true">${text}</span>
      <div class="buttons">
        <button class="add">＋</button>
        <button class="indent">→</button>
        <button class="outdent">←</button>
        <button class="delete">🗑</button>
      </div>
    </div>
    <ul class="children"></ul>
  `;
  const childrenUl = li.querySelector(".children");
  children.forEach(child => {
    childrenUl.appendChild(createNode(child.text, child.children));
  });
  return li;
}

// JSON変換
function nodeToJson(li) {
  const text = li.querySelector(".text").textContent;
  const children = Array.from(li.querySelector(".children").children).map(nodeToJson);
  return { text, children };
}
function jsonToNode(data) {
  return createNode(data.text, data.children);
}

// 全部展開・折り畳み
expandAllBtn.addEventListener("click", () => {
  document.querySelectorAll(".children").forEach(c => c.classList.remove("hidden"));
  document.querySelectorAll(".toggle").forEach(btn => btn.textContent = "▼");
});
collapseAllBtn.addEventListener("click", () => {
  document.querySelectorAll(".children").forEach(c => {
    if (c.children.length > 0) c.classList.add("hidden");
  });
  document.querySelectorAll(".toggle").forEach(btn => btn.textContent = "▶");
});

// 保存
saveCloudBtn.addEventListener("click", async () => {
  const data = Array.from(outline.children).map(nodeToJson);
  const project = getCurrentProject();
  try {
    await db.collection("outlines").doc(project).set({ data });
    alert(`${project} に保存しました`);
  } catch (err) {
    console.error(err);
    alert("保存に失敗しました");
  }
});

// 読み込み
async function loadOutlineFromCloud(project) {
  try {
    const doc = await db.collection("outlines").doc(project).get();
    outline.innerHTML = "";

    if (doc.exists) {
      const data = doc.data().data;
      if (data && data.length > 0) {
        data.forEach(item => outline.appendChild(jsonToNode(item)));
      } else {
        // データが空なら初期行を追加
        outline.appendChild(createNode("メモを書く"));
      }
      console.log(`${project} を読み込みました`);
    } else {
      // 新規プロジェクト用の初期行
      outline.appendChild(createNode("メモを書く"));
      console.log(`${project} にデータがありません（新規プロジェクト）`);
    }

  } catch (err) {
    console.error(err);
    alert("読み込みに失敗しました");
  }
}


// ページロード時
window.addEventListener("DOMContentLoaded", () => {
  loadProjects();
});
