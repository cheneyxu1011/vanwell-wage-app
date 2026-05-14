const STORAGE_KEY = "vanwell.wage.flywheel.v1";

const defaultState = {
  config: {
    operations: [
      { id: "bond-straight", name: "普通直线压胶", standardMinutes: 5, unitPrice: 5 },
      { id: "bond-curve", name: "曲线压胶", standardMinutes: 6.5, unitPrice: 6.5 },
      { id: "sewing", name: "缝制", standardMinutes: 4, unitPrice: 4 },
      { id: "pressing", name: "小烫", standardMinutes: 2.5, unitPrice: 2.5 },
    ],
    fabrics: [
      { id: "normal-knit", name: "普通针织", coeff: 1 },
      { id: "stretch", name: "高弹面料", coeff: 1.15 },
      { id: "heavy", name: "厚料复合", coeff: 1.2 },
      { id: "outdoor", name: "顶级户外", coeff: 1.3 },
    ],
    levels: [
      { id: "apprentice", name: "学徒", multiplier: 0.7 },
      { id: "l1", name: "一级", multiplier: 1 },
      { id: "l2", name: "二级", multiplier: 1.15 },
      { id: "l3", name: "三级", multiplier: 1.35 },
      { id: "technician", name: "技师", multiplier: 1.6 },
    ],
    qualityRules: {
      sMin: 98,
      sPct: 15,
      aMin: 95,
      aPct: 8,
      bMin: 90,
      bPct: 3,
      dBelow: 85,
      dPct: -5,
    },
    efficiencyRules: {
      pct100: 5,
      pct110: 12,
      pct125: 20,
      lowQualityCap: 5,
    },
    allowances: {
      scan: 2,
      tablet: 5,
      ai: 3,
      dashboard: 1,
    },
  },
  history: [],
  implementation: {
    fieldOwner: "HR填写：日期、工人、工序、件数、质量分、实际用时、补贴与扣款。\n车间提供：当日生产数量、异常说明、返修情况。",
    parameterOwner: "IE/生产负责人提出工序单价与标准工时。\n管理层批准面料系数、等级倍率、质量/效率规则。\nHR在管理页录入，财务复核后生效。",
    reviewFlow: "员工提出疑问 → HR调出工资明细 → 车间/IE复核生产数据 → 管理者确认调整 → HR保存修正记录。",
    pilotScope: "先选压胶工序，选择1-2个典型款号，试运行4周。\n试运行期与原工资表并行核对，不直接替代正式工资。",
  },
};

let state = loadState();
let latestCalculation = null;

const views = {
  calculator: document.querySelector("#calculatorView"),
  manager: document.querySelector("#managerView"),
  history: document.querySelector("#historyView"),
  implementation: document.querySelector("#implementationView"),
};

const viewTitles = {
  calculator: "每日工资计算",
  manager: "管理参数",
  history: "计算记录",
  implementation: "落地设置",
};

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(defaultState);

  try {
    return mergeState(structuredClone(defaultState), JSON.parse(raw));
  } catch {
    return structuredClone(defaultState);
  }
}

function mergeState(base, saved) {
  return {
    ...base,
    ...saved,
    config: {
      ...base.config,
      ...saved.config,
      qualityRules: { ...base.config.qualityRules, ...saved.config?.qualityRules },
      efficiencyRules: { ...base.config.efficiencyRules, ...saved.config?.efficiencyRules },
      allowances: { ...base.config.allowances, ...saved.config?.allowances },
    },
    history: Array.isArray(saved.history) ? saved.history : [],
    implementation: { ...base.implementation, ...saved.implementation },
  };
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function numberValue(id) {
  return Number(document.querySelector(`#${id}`).value || 0);
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function init() {
  document.querySelector("#workDate").valueAsDate = new Date();
  bindNavigation();
  bindCalculator();
  bindManager();
  bindHistory();
  bindImplementation();
  renderAll();
}

function bindNavigation() {
  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.addEventListener("click", () => {
      const nextView = button.dataset.view;
      document.querySelectorAll(".nav-tab").forEach((tab) => tab.classList.remove("is-active"));
      button.classList.add("is-active");
      Object.entries(views).forEach(([key, view]) => view.classList.toggle("is-active", key === nextView));
      document.querySelector("#viewTitle").textContent = viewTitles[nextView];
      document.querySelector("#saveRecord").style.display = nextView === "calculator" ? "" : "none";
    });
  });
}

function bindCalculator() {
  document.querySelector("#wageForm").addEventListener("input", calculateAndRender);
  document.querySelector("#saveRecord").addEventListener("click", saveCurrentRecord);
  document.querySelector("#resetDemo").addEventListener("click", () => {
    state = structuredClone(defaultState);
    persist();
    renderAll();
  });
}

function bindManager() {
  document.querySelector("#addOperation").addEventListener("click", () => {
    state.config.operations.push({ id: uid("operation"), name: "新工序", standardMinutes: 5, unitPrice: 5 });
    persist();
    renderAll();
  });

  document.querySelector("#addFabric").addEventListener("click", () => {
    state.config.fabrics.push({ id: uid("fabric"), name: "新面料", coeff: 1 });
    persist();
    renderAll();
  });

  document.querySelector("#addLevel").addEventListener("click", () => {
    state.config.levels.push({ id: uid("level"), name: "新等级", multiplier: 1 });
    persist();
    renderAll();
  });

  [
    "qualityS",
    "qualitySPct",
    "qualityA",
    "qualityAPct",
    "qualityB",
    "qualityBPct",
    "qualityD",
    "qualityDPct",
    "eff100",
    "eff110",
    "eff125",
    "lowQualityEffCap",
  ].forEach((id) => document.querySelector(`#${id}`).addEventListener("input", updateRulesFromInputs));

  document.querySelector("#exportConfig").addEventListener("click", () => {
    document.querySelector("#configJson").value = JSON.stringify(state.config, null, 2);
  });

  document.querySelector("#importConfig").addEventListener("click", () => {
    try {
      const imported = JSON.parse(document.querySelector("#configJson").value);
      state.config = mergeState({ config: defaultState.config }, { config: imported }).config;
      persist();
      renderAll();
      document.querySelector("#configJson").value = "导入成功。";
    } catch {
      document.querySelector("#configJson").value = "JSON 格式不正确，请检查后再导入。";
    }
  });

  document.querySelector("#clearHistory").addEventListener("click", () => {
    state.history = [];
    persist();
    renderHistory();
  });
}

function bindHistory() {
  document.querySelector("#exportCsv").addEventListener("click", () => {
    const rows = [
      ["日期", "工人", "员工编号", "工序", "件数", "质量等级", "效率达成", "合计"],
      ...state.history.map((item) => [
        item.date,
        item.workerName,
        item.workerId,
        item.operationName,
        item.quantity,
        item.qualityTier,
        `${item.efficiencyRate.toFixed(1)}%`,
        item.total.toFixed(2),
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `vanwell-wage-records-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
}

function bindImplementation() {
  ["fieldOwner", "parameterOwner", "reviewFlow", "pilotScope"].forEach((id) => {
    document.querySelector(`#${id}`).addEventListener("input", () => {
      state.implementation[id] = document.querySelector(`#${id}`).value;
      persist();
    });
  });

  document.querySelector("#saveImplementation").addEventListener("click", () => {
    ["fieldOwner", "parameterOwner", "reviewFlow", "pilotScope"].forEach((id) => {
      state.implementation[id] = document.querySelector(`#${id}`).value;
    });
    persist();
    document.querySelector("#saveImplementation").textContent = "已保存";
    window.setTimeout(() => {
      document.querySelector("#saveImplementation").textContent = "保存设置";
    }, 1200);
  });
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function renderAll() {
  renderSelectors();
  renderManager();
  renderHistory();
  renderImplementation();
  calculateAndRender();
}

function renderImplementation() {
  Object.entries(state.implementation).forEach(([key, value]) => {
    const input = document.querySelector(`#${key}`);
    if (input && input.value !== value) input.value = value;
  });
}

function renderSelectors() {
  fillSelect("operationId", state.config.operations, "name");
  fillSelect("fabricId", state.config.fabrics, "name");
  fillSelect("levelId", state.config.levels, "name");
}

function fillSelect(id, rows, labelKey) {
  const select = document.querySelector(`#${id}`);
  const oldValue = select.value;
  select.innerHTML = rows.map((row) => `<option value="${row.id}">${row[labelKey]}</option>`).join("");
  if (rows.some((row) => row.id === oldValue)) select.value = oldValue;
}

function calculateAndRender() {
  const operation = byId(state.config.operations, document.querySelector("#operationId").value);
  const fabric = byId(state.config.fabrics, document.querySelector("#fabricId").value);
  const level = byId(state.config.levels, document.querySelector("#levelId").value);
  if (!operation || !fabric || !level) return;

  const quantity = numberValue("quantity");
  const qualityScore = Math.max(0, Math.min(100, numberValue("qualityScore")));
  const actualMinutes = Math.max(1, numberValue("actualMinutes"));
  const baseBeforeLevel = quantity * operation.unitPrice * fabric.coeff;
  const basePay = baseBeforeLevel * level.multiplier;
  const quality = getQualityTier(qualityScore);
  const qualityBonus = basePay * (quality.pct / 100);
  const standardTotalMinutes = operation.standardMinutes * quantity;
  const efficiencyRate = standardTotalMinutes > 0 ? (standardTotalMinutes / actualMinutes) * 100 : 0;
  const efficiency = getEfficiencyTier(efficiencyRate, qualityScore);
  const efficiencyBonus = basePay * (efficiency.pct / 100);
  const dataAllowance = selectedAllowances().reduce((sum, key) => sum + Number(state.config.allowances[key] || 0), 0);
  const feedbackReward = numberValue("feedbackReward");
  const teamBonus = numberValue("teamBonus");
  const deductions = numberValue("deductions");
  const total = basePay + qualityBonus + efficiencyBonus + dataAllowance + feedbackReward + teamBonus - deductions;

  latestCalculation = {
    date: document.querySelector("#workDate").value,
    workerName: document.querySelector("#workerName").value || "未填写",
    workerId: document.querySelector("#workerId").value || "",
    operationName: operation.name,
    quantity,
    qualityTier: quality.name,
    efficiencyRate,
    total,
    rows: [
      ["基础工序工资", basePay],
      [`质量奖金（${quality.name} / ${quality.pct}%）`, qualityBonus],
      [`效率奖金（${efficiency.name} / ${efficiency.pct}%）`, efficiencyBonus],
      ["数据 / AI 补贴", dataAllowance],
      ["问题反馈奖", feedbackReward],
      ["团队奖金", teamBonus],
      ["扣款", -deductions],
    ],
  };

  document.querySelector("#totalPay").textContent = money(total);
  document.querySelector("#qualityTier").textContent = `质量等级：${quality.name}（${quality.pct}%）`;
  document.querySelector("#efficiencyTier").textContent = `效率达成：${efficiencyRate.toFixed(1)}%（${efficiency.name}）`;
  document.querySelector("#breakdown").innerHTML = latestCalculation.rows
    .map(([label, value]) => {
      return `<div class="breakdown-row"><span>${label}</span><strong>${money(value)}</strong></div>`;
    })
    .join("");
}

function byId(rows, id) {
  return rows.find((row) => row.id === id);
}

function selectedAllowances() {
  return Array.from(document.querySelectorAll('input[name="allowance"]:checked')).map((input) => input.value);
}

function getQualityTier(score) {
  const rules = state.config.qualityRules;
  if (score >= rules.sMin) return { name: "S", pct: rules.sPct };
  if (score >= rules.aMin) return { name: "A", pct: rules.aPct };
  if (score >= rules.bMin) return { name: "B", pct: rules.bPct };
  if (score < rules.dBelow) return { name: "D", pct: rules.dPct };
  return { name: "C", pct: 0 };
}

function getEfficiencyTier(rate, qualityScore) {
  const rules = state.config.efficiencyRules;
  let tier = { name: "未达标", pct: 0 };
  if (rate >= 125) tier = { name: "125%+", pct: rules.pct125 };
  else if (rate >= 110) tier = { name: "110%-125%", pct: rules.pct110 };
  else if (rate >= 100) tier = { name: "100%-110%", pct: rules.pct100 };

  if (qualityScore < state.config.qualityRules.bMin) {
    tier = { ...tier, name: `${tier.name}（低质封顶）`, pct: Math.min(tier.pct, rules.lowQualityCap) };
  }
  return tier;
}

function saveCurrentRecord() {
  calculateAndRender();
  if (!latestCalculation) return;
  state.history.unshift({ id: uid("record"), savedAt: new Date().toISOString(), ...latestCalculation });
  state.history = state.history.slice(0, 200);
  persist();
  renderHistory();
  document.querySelector("#formulaStatus").textContent = "已保存";
  window.setTimeout(() => {
    document.querySelector("#formulaStatus").textContent = "自动计算";
  }, 1200);
}

function renderManager() {
  renderEditableTable("operationsTable", state.config.operations, [
    { key: "name", type: "text" },
    { key: "standardMinutes", type: "number", step: "0.1" },
    { key: "unitPrice", type: "number", step: "0.1" },
  ]);
  renderEditableTable("fabricsTable", state.config.fabrics, [
    { key: "name", type: "text" },
    { key: "coeff", type: "number", step: "0.01" },
  ]);
  renderEditableTable("levelsTable", state.config.levels, [
    { key: "name", type: "text" },
    { key: "multiplier", type: "number", step: "0.01" },
  ]);
  renderRuleInputs();
}

function renderEditableTable(tableId, rows, columns) {
  const tbody = document.querySelector(`#${tableId}`);
  tbody.innerHTML = rows
    .map((row) => {
      const cells = columns
        .map((column) => {
          const value = row[column.key];
          return `<td><input data-table="${tableId}" data-id="${row.id}" data-key="${column.key}" type="${column.type}" step="${column.step || 1}" value="${value}" /></td>`;
        })
        .join("");
      return `<tr>${cells}<td><button class="delete-button" data-delete="${tableId}" data-id="${row.id}" type="button">删除</button></td></tr>`;
    })
    .join("");

  tbody.querySelectorAll("input").forEach((input) => input.addEventListener("input", updateTableValue));
  tbody.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", deleteTableRow));
}

function updateTableValue(event) {
  const input = event.target;
  const rows = tableRows(input.dataset.table);
  const row = rows.find((item) => item.id === input.dataset.id);
  if (!row) return;
  row[input.dataset.key] = input.type === "number" ? Number(input.value || 0) : input.value;
  persist();
  renderSelectors();
  calculateAndRender();
}

function deleteTableRow(event) {
  const button = event.target;
  const rows = tableRows(button.dataset.delete);
  if (rows.length <= 1) return;
  const index = rows.findIndex((item) => item.id === button.dataset.id);
  if (index >= 0) rows.splice(index, 1);
  persist();
  renderAll();
}

function tableRows(tableId) {
  if (tableId === "operationsTable") return state.config.operations;
  if (tableId === "fabricsTable") return state.config.fabrics;
  return state.config.levels;
}

function renderRuleInputs() {
  const quality = state.config.qualityRules;
  const efficiency = state.config.efficiencyRules;
  document.querySelector("#qualityS").value = quality.sMin;
  document.querySelector("#qualitySPct").value = quality.sPct;
  document.querySelector("#qualityA").value = quality.aMin;
  document.querySelector("#qualityAPct").value = quality.aPct;
  document.querySelector("#qualityB").value = quality.bMin;
  document.querySelector("#qualityBPct").value = quality.bPct;
  document.querySelector("#qualityD").value = quality.dBelow;
  document.querySelector("#qualityDPct").value = quality.dPct;
  document.querySelector("#eff100").value = efficiency.pct100;
  document.querySelector("#eff110").value = efficiency.pct110;
  document.querySelector("#eff125").value = efficiency.pct125;
  document.querySelector("#lowQualityEffCap").value = efficiency.lowQualityCap;
}

function updateRulesFromInputs() {
  state.config.qualityRules = {
    sMin: numberValue("qualityS"),
    sPct: numberValue("qualitySPct"),
    aMin: numberValue("qualityA"),
    aPct: numberValue("qualityAPct"),
    bMin: numberValue("qualityB"),
    bPct: numberValue("qualityBPct"),
    dBelow: numberValue("qualityD"),
    dPct: numberValue("qualityDPct"),
  };
  state.config.efficiencyRules = {
    pct100: numberValue("eff100"),
    pct110: numberValue("eff110"),
    pct125: numberValue("eff125"),
    lowQualityCap: numberValue("lowQualityEffCap"),
  };
  persist();
  calculateAndRender();
}

function renderHistory() {
  const tbody = document.querySelector("#historyTable");
  if (!state.history.length) {
    tbody.innerHTML = `<tr><td class="empty-state" colspan="7">还没有保存记录。</td></tr>`;
    return;
  }

  tbody.innerHTML = state.history
    .map((item) => {
      return `<tr>
        <td>${item.date || "-"}</td>
        <td>${item.workerName}</td>
        <td>${item.operationName}</td>
        <td>${item.quantity}</td>
        <td>${item.qualityTier}</td>
        <td>${item.efficiencyRate.toFixed(1)}%</td>
        <td><strong>${money(item.total)}</strong></td>
      </tr>`;
    })
    .join("");
}

init();
