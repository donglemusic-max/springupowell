import React, { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const GAS_URL =
  "https://script.google.com/macros/s/AKfycbx3NV3MGZp3C7cyMV8psWWne6a3egu2Zi_0b-6aG5hfbH-qCPpfTdsNO303VLWO93pc/exec"; // ⚠️ 본인의 배포 URL로 변경하세요.
const COLORS = [
  "#4A90E2",
  "#50E3C2",
  "#F5A623",
  "#D0021B",
  "#9013FE",
  "#7ED321",
  "#f368e0",
  "#ff9f43",
];

export default function App() {
  const [pin, setPin] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState("report"); // 기본 화면을 리포트로 설정 가능

  const [data, setData] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAPI = async (action, payload = {}) => {
    try {
      const res = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action, pin, ...payload }),
      });
      return await res.json();
    } catch (e) {
      return { success: false, message: "서버 연결 실패" };
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const result = await fetchAPI("login");
    if (result.success) {
      setIsAuthenticated(true);
      loadData();
    } else {
      alert(result.message);
    }
    setLoading(false);
  };

  const loadData = async () => {
    setLoading(true);
    const result = await fetchAPI("getData");
    if (result.success) {
      setData(result.data);
      setMappings(result.mappings || []);
    }
    setLoading(false);
  };

  const dynamicCategories = useMemo(() => {
    const base = [
      "식비/외식",
      "주거/통신",
      "교통",
      "식재료/생필품",
      "십일조",
      "헌금",
      "미분류",
    ];
    const fromMappings = mappings.map((m) => m.category);
    const fromData = data.map((d) => d["카테고리"]);
    let uniqueCats = Array.from(
      new Set([...base, ...fromMappings, ...fromData])
    ).filter(Boolean);
    uniqueCats.sort((a, b) =>
      a === "미분류" ? 1 : b === "미분류" ? -1 : a.localeCompare(b)
    );
    return uniqueCats;
  }, [mappings, data]);

  if (!isAuthenticated) {
    return (
      <div style={centerStyle}>
        <form onSubmit={handleLogin} style={cardStyle}>
          <h2 style={{ textAlign: "center" }}>가계부 접속</h2>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            style={inputStyle}
            placeholder="PIN 번호"
          />
          <button disabled={loading} style={btnStyle}>
            {loading ? "인증 중..." : "접속하기"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={appWrapperStyle}>
      <header style={headerStyle}>
        <h2>우리집 스마트 가계부 💰</h2>
        <button onClick={() => setIsAuthenticated(false)} style={subBtnStyle}>
          로그아웃
        </button>
      </header>

      <nav style={navStyle}>
        <button
          onClick={() => setActiveTab("report")}
          style={tabStyle(activeTab === "report")}
        >
          재무 리포트
        </button>
        <button
          onClick={() => setActiveTab("dashboard")}
          style={tabStyle(activeTab === "dashboard")}
        >
          내역 및 통계
        </button>
        <button
          onClick={() => setActiveTab("input")}
          style={tabStyle(activeTab === "input")}
        >
          직접 입력
        </button>
        <button
          onClick={() => setActiveTab("manage")}
          style={tabStyle(activeTab === "manage")}
        >
          카테고리 관리
        </button>
      </nav>

      {loading && (
        <div
          style={{
            textAlign: "center",
            marginBottom: "15px",
            color: "#4A90E2",
            fontWeight: "bold",
          }}
        >
          동기화 중... 🔄
        </div>
      )}

      {activeTab === "report" && <AdvisorReport data={data} />}
      {activeTab === "dashboard" && (
        <Dashboard
          data={data}
          setData={setData}
          fetchAPI={fetchAPI}
          categories={dynamicCategories}
        />
      )}
      {activeTab === "input" && (
        <ManualInput
          onSubmit={loadData}
          fetchAPI={fetchAPI}
          categories={dynamicCategories}
        />
      )}
      {activeTab === "manage" && (
        <CategoryManager
          mappings={mappings}
          loadData={loadData}
          fetchAPI={fetchAPI}
        />
      )}
    </div>
  );
}

// ==========================================
// [신규] 컴포넌트: 기독교 재무 어드바이저 & 변화율 리포트
// ==========================================
function AdvisorReport({ data }) {
  const [selectedMonth, setSelectedMonth] = useState("all");

  const availableMonths = useMemo(
    () =>
      Array.from(
        new Set(data.map((item) => String(item["날짜"]).substring(0, 7)))
      ).sort((a, b) => b.localeCompare(a)),
    [data]
  );

  const reportStats = useMemo(() => {
    if (selectedMonth === "all") return null;

    const [year, month] = selectedMonth.split(".").map(Number);
    const prevMonthStr = `${year}.${String(month - 1).padStart(2, "0")}`; // JS Date 처리 고려시 연도 넘어가는 로직 추가 가능

    const currentData = data.filter((item) =>
      String(item["날짜"]).startsWith(selectedMonth)
    );
    const prevData = data.filter((item) =>
      String(item["날짜"]).startsWith(prevMonthStr)
    );

    let currentTotal = 0,
      prevTotal = 0;
    let givingTotal = 0; // 나눔/헌신
    let fixedTotal = 0; // 주거/통신/보험 등

    const currentMap = {};
    const prevMap = {};

    currentData.forEach((item) => {
      const amt = Number(item["금액"]);
      currentTotal += amt;
      currentMap[item["카테고리"]] = (currentMap[item["카테고리"]] || 0) + amt;

      // 기독교적 분석을 위한 카테고리 묶음
      if (
        ["십일조", "헌금", "컴패션", "후원", "기부"].includes(item["카테고리"])
      )
        givingTotal += amt;
      if (
        ["주거/통신", "관리비", "보험료", "대출 상환금", "주거이자"].includes(
          item["카테고리"]
        )
      )
        fixedTotal += amt;
    });

    prevData.forEach((item) => {
      const amt = Number(item["금액"]);
      prevTotal += amt;
      prevMap[item["카테고리"]] = (prevMap[item["카테고리"]] || 0) + amt;
    });

    const categories = Object.keys(currentMap)
      .map((key) => {
        const current = currentMap[key];
        const prev = prevMap[key] || 0;
        return {
          name: key,
          value: current,
          diff: current - prev,
          rate: prev === 0 ? 100 : ((current - prev) / prev) * 100,
        };
      })
      .sort((a, b) => b.value - a.value);

    return {
      currentTotal,
      prevTotal,
      givingTotal,
      fixedTotal,
      categories,
      monthDiff: currentTotal - prevTotal,
    };
  }, [data, selectedMonth]);

  if (selectedMonth === "all") {
    return (
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>성경적 재무 리포트</h3>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          style={selectStyle}
        >
          <option value="all">월을 선택해 주세요</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>
              {m}월
            </option>
          ))}
        </select>
        <p style={{ color: "#666", marginTop: "20px" }}>
          월별 데이터를 선택하시면, 전월 대비 지출 증감률과 전문가의 재무 원칙
          분석 리포트를 제공합니다.
        </p>
      </div>
    );
  }

  if (!reportStats) return null;

  const givingRatio =
    reportStats.currentTotal > 0
      ? ((reportStats.givingTotal / reportStats.currentTotal) * 100).toFixed(1)
      : 0;
  const fixedRatio =
    reportStats.currentTotal > 0
      ? ((reportStats.fixedTotal / reportStats.currentTotal) * 100).toFixed(1)
      : 0;

  return (
    <div style={columnStyle}>
      <div style={rowBetween}>
        <h3>{selectedMonth}월 재무 리포트</h3>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          style={selectStyle}
        >
          {availableMonths.map((m) => (
            <option key={m} value={m}>
              {m}월
            </option>
          ))}
        </select>
      </div>

      {/* 종합 요약 */}
      <div style={summaryCard}>
        <p>이번 달 총 지출</p>
        <h1 style={{ margin: "10px 0" }}>
          {reportStats.currentTotal.toLocaleString()} 원
        </h1>
        {reportStats.prevTotal > 0 && (
          <p
            style={{
              fontSize: "14px",
              color: reportStats.monthDiff > 0 ? "#ffcccc" : "#c8f7c5",
              margin: 0,
            }}
          >
            전월 대비 {reportStats.monthDiff > 0 ? "▲" : "▼"}{" "}
            {Math.abs(reportStats.monthDiff).toLocaleString()}원 (
            {((reportStats.monthDiff / reportStats.prevTotal) * 100).toFixed(1)}
            %)
          </p>
        )}
      </div>

      {/* 기독교적 재무 분석 리포트 */}
      <div style={reportCardStyle}>
        <h4
          style={{
            color: "#2c3e50",
            borderBottom: "2px solid #e1e4e8",
            paddingBottom: "10px",
            marginTop: 0,
          }}
        >
          📖 크리스천 청지기 분석 리포트
        </h4>

        <div style={{ marginBottom: "15px" }}>
          <b style={{ color: "#d35400" }}>1. 나눔과 헌신 (Giving)</b>
          <p
            style={{
              fontSize: "14px",
              lineHeight: "1.6",
              color: "#444",
              marginTop: "5px",
            }}
          >
            이번 달 총 지출 중 <b>십일조 및 헌금, 후원(컴패션 등)</b>이 차지하는
            비중은 <b>{givingRatio}%</b>(
            {reportStats.givingTotal.toLocaleString()}원) 입니다. <br />
            <span
              style={{
                color: "#7f8c8d",
                fontStyle: "italic",
                display: "block",
                marginTop: "5px",
                padding: "8px",
                backgroundColor: "#f9f9f9",
                borderLeft: "3px solid #d35400",
              }}
            >
              "할 수 있는 한 모든 방법으로, 할 수 있는 한 모든 사람에게 선을
              행하십시오." — 존 웨슬리 (John Wesley)
            </span>
            {givingRatio > 10
              ? "성경적 물질관에 따라 수입의 첫 열매와 나눔을 훌륭하게 실천하고 계십니다. 물질이 있는 곳에 마음이 있다는 말씀(마 6:21)처럼, 건강한 영적 우선순위가 돋보입니다."
              : "재무 계획을 세울 때 존 웨슬리의 '벌고, 저축하고, 나누라'는 원칙을 기억하며, 나눔의 파이를 예산에 미리 반영해 보는 것을 추천합니다."}
          </p>
        </div>

        <div style={{ marginBottom: "15px" }}>
          <b style={{ color: "#2980b9" }}>
            2. 고정 지출과 재무 절제력 (Prudence)
          </b>
          <p
            style={{
              fontSize: "14px",
              lineHeight: "1.6",
              color: "#444",
              marginTop: "5px",
            }}
          >
            관리비, 통신료, 대출상환 등{" "}
            <b>구조적 고정 지출 비중이 {fixedRatio}%</b> 입니다. <br />
            <span
              style={{
                color: "#7f8c8d",
                fontStyle: "italic",
                display: "block",
                marginTop: "5px",
                padding: "8px",
                backgroundColor: "#f9f9f9",
                borderLeft: "3px solid #2980b9",
              }}
            >
              "지혜 있는 자의 집에는 귀한 보배와 기름이 있으나 미련한 자는
              이것을 다 삼켜 버리느니라" — 잠언 21:20
            </span>
            {fixedRatio > 50
              ? "기독교 재무설계학자 론 블루(Ron Blue)는 고정 지출이 과도할 경우 재정적 자유(Financial Freedom)와 사역을 위한 유동성이 묶일 수 있다고 경고합니다. 통신비 결합 할인이나 에너지 절약을 통해 고정비를 10% 정도 다이어트 해보시길 권면합니다."
              : "고정 지출이 안정적으로 유지되고 있어, 예비비(Emergency Fund)를 마련하거나 부채를 상환하는 데 매우 유리한 구조입니다."}
          </p>
        </div>
      </div>

      {/* 전월 대비 카테고리별 증감률 */}
      <div style={cardStyle}>
        <h4 style={{ marginTop: 0 }}>📈 전월 대비 항목별 증감률 상세</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {reportStats.categories.map((s) => (
            <div
              key={s.name}
              style={{
                ...rowBetween,
                borderBottom: "1px solid #f1f1f1",
                paddingBottom: "8px",
              }}
            >
              <span
                style={{ fontSize: "14px", fontWeight: "bold", color: "#333" }}
              >
                {s.name}
              </span>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "14px" }}>
                  {s.value.toLocaleString()}원
                </div>
                {s.diff !== 0 && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: s.diff > 0 ? "#e74c3c" : "#2ecc71",
                    }}
                  >
                    {s.diff > 0
                      ? `▲ ${Math.abs(s.rate).toFixed(1)}% 증가`
                      : `▼ ${Math.abs(s.rate).toFixed(1)}% 감소`}
                  </div>
                )}
              </div>
            </div>
          ))}
          {reportStats.categories.length === 0 && (
            <div style={{ fontSize: "13px", color: "#999" }}>
              데이터가 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 컴포넌트: 내역 및 통계 (어드바이저 제거됨, 테이블 중심)
// ==========================================
function Dashboard({ data, setData, fetchAPI, categories }) {
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const availableMonths = useMemo(
    () =>
      Array.from(
        new Set(data.map((item) => String(item["날짜"]).substring(0, 7)))
      ).sort((a, b) => b.localeCompare(a)),
    [data]
  );
  const filteredByMonth = useMemo(
    () =>
      selectedMonth === "all"
        ? data
        : data.filter((item) => String(item["날짜"]).startsWith(selectedMonth)),
    [data, selectedMonth]
  );
  const currentCategoriesInMonth = useMemo(
    () => Array.from(new Set(filteredByMonth.map((item) => item["카테고리"]))),
    [filteredByMonth]
  );
  const finalTableData = useMemo(
    () =>
      categoryFilter === "all"
        ? filteredByMonth
        : filteredByMonth.filter((item) => item["카테고리"] === categoryFilter),
    [filteredByMonth, categoryFilter]
  );

  const categoryStats = useMemo(() => {
    const currentMap = {};
    filteredByMonth.forEach(
      (item) =>
        (currentMap[item["카테고리"]] =
          (currentMap[item["카테고리"]] || 0) + Number(item["금액"]))
    );
    return Object.keys(currentMap)
      .map((key) => ({ name: key, value: currentMap[key] }))
      .sort((a, b) => b.value - a.value);
  }, [filteredByMonth]);

  const handleCategoryChange = async (item, newCategory) => {
    setData(
      data.map((d) =>
        d["날짜"] === item["날짜"] &&
        d["금액"] === item["금액"] &&
        d["사용처"] === item["사용처"]
          ? { ...d, 카테고리: newCategory }
          : d
      )
    );
    await fetchAPI("updateCategory", {
      record: {
        date: item["날짜"],
        amount: item["금액"],
        merchant: item["사용처"],
        category: newCategory,
      },
    });
  };

  useEffect(() => {
    setCategoryFilter("all");
  }, [selectedMonth]);

  return (
    <div style={columnStyle}>
      <div style={rowBetween}>
        <h3>지출 시각화 및 세부 내역</h3>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          style={selectStyle}
        >
          <option value="all">전체 기간</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>
              {m}월
            </option>
          ))}
        </select>
      </div>

      <div style={cardStyle}>
        <h4 style={{ marginTop: 0 }}>카테고리 비중</h4>
        <div style={{ height: "220px", width: "100%" }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={categoryStats}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="value"
              >
                {categoryStats.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => v.toLocaleString() + "원"} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ marginBottom: "15px" }}>
          <h4 style={{ margin: "0 0 10px 0" }}>
            상세 내역 (항목별 카테고리 즉시 변경)
          </h4>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={() => setCategoryFilter("all")}
              style={filterBtnStyle(categoryFilter === "all")}
            >
              전체보기
            </button>
            {currentCategoriesInMonth.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                style={filterBtnStyle(categoryFilter === cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div style={tableWrapper}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>날짜</th>
                <th style={thStyle}>사용처</th>
                <th style={thStyle}>카테고리 지정</th>
                <th style={{ ...thStyle, textAlign: "right" }}>금액</th>
              </tr>
            </thead>
            <tbody>
              {finalTableData.map((item, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f1f1f1" }}>
                  <td style={tdStyle}>{item["날짜"]}</td>
                  <td style={tdStyle}>{item["사용처"]}</td>
                  <td style={tdStyle}>
                    <select
                      value={item["카테고리"]}
                      onChange={(e) =>
                        handleCategoryChange(item, e.target.value)
                      }
                      style={categoryDropdownStyle(
                        item["카테고리"] === "미분류"
                      )}
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      fontWeight: "bold",
                    }}
                  >
                    {Number(item["금액"]).toLocaleString()}원
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 컴포넌트: 직접 입력 폼
// ==========================================
function ManualInput({ onSubmit, fetchAPI, categories }) {
  const [form, setForm] = useState({
    date: "",
    amount: "",
    merchant: "",
    memo: "",
    category: "미분류",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.date || !form.amount || !form.merchant)
      return alert("필수 항목 확인!");
    setLoading(true);
    const result = await fetchAPI("addEntry", {
      record: { ...form, date: form.date.replace(/-/g, ".") },
    });
    if (result.success) {
      setForm({
        date: "",
        amount: "",
        merchant: "",
        memo: "",
        category: "미분류",
      });
      onSubmit();
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>내역 직접 추가하기</h3>
      <div style={columnStyle}>
        <input
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          style={inputStyle}
        />
        <input
          type="number"
          placeholder="금액"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          style={inputStyle}
        />
        <input
          type="text"
          placeholder="사용처"
          value={form.merchant}
          onChange={(e) => setForm({ ...form, merchant: e.target.value })}
          style={inputStyle}
        />
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          style={inputStyle}
        >
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? "저장 중..." : "등록하기"}
        </button>
      </div>
    </form>
  );
}

// ==========================================
// 컴포넌트: 카테고리 관리
// ==========================================
function CategoryManager({ mappings, loadData, fetchAPI }) {
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!keyword.trim() || !category.trim())
      return alert("키워드와 카테고리를 모두 입력하세요.");
    setIsProcessing(true);
    const res = await fetchAPI("saveMapping", {
      keyword: keyword.trim(),
      category: category.trim(),
    });
    if (res.success) {
      setKeyword("");
      setCategory("");
      await loadData();
    } else {
      alert("오류가 발생했습니다.");
    }
    setIsProcessing(false);
  };

  const handleDelete = async (kw) => {
    if (!window.confirm(`'${kw}' 키워드 맵핑을 삭제하시겠습니까?`)) return;
    setIsProcessing(true);
    const res = await fetchAPI("deleteMapping", { keyword: kw });
    if (res.success) await loadData();
    setIsProcessing(false);
  };

  return (
    <div style={columnStyle}>
      <div style={advisorCard}>
        <h4 style={{ margin: "0 0 10px 0" }}>💡 자동 분류 규칙 관리</h4>
        <p style={{ margin: 0, fontSize: "13px", color: "#555" }}>
          특정 상호명(예: 쿠팡)을 지정한 카테고리(예: 식재료)로 자동 연결합니다.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        style={{
          ...cardStyle,
          display: "flex",
          gap: "10px",
          alignItems: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: "130px" }}>
          <label style={{ fontSize: "12px", color: "#666" }}>결제 키워드</label>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={inputStyle}
            placeholder="예: 알라딘"
          />
        </div>
        <div style={{ flex: 1, minWidth: "130px" }}>
          <label style={{ fontSize: "12px", color: "#666" }}>카테고리명</label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={inputStyle}
            placeholder="예: 문화/여가"
          />
        </div>
        <button
          type="submit"
          disabled={isProcessing}
          style={{ ...btnStyle, width: "auto", padding: "12px 20px" }}
        >
          {isProcessing ? "저장 중" : "추가"}
        </button>
      </form>

      <div style={cardStyle}>
        <h4>등록된 규칙 ({mappings.length}건)</h4>
        <div style={tableWrapper}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>키워드</th>
                <th style={thStyle}>카테고리</th>
                <th style={thStyle}>관리</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f1f1f1" }}>
                  <td style={tdStyle}>{m.keyword}</td>
                  <td style={tdStyle}>
                    <span style={badgeStyle}>{m.category}</span>
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => handleDelete(m.keyword)}
                      disabled={isProcessing}
                      style={deleteBtnStyle}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- 공통 스타일 (CSS-in-JS) ---
const appWrapperStyle = {
  maxWidth: "600px",
  margin: "0 auto",
  padding: "15px",
  fontFamily: "'Pretendard', sans-serif",
  backgroundColor: "#f4f7f6",
  minHeight: "100vh",
};
const centerStyle = {
  display: "flex",
  height: "100vh",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#f4f7f6",
};
const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "20px",
};
const navStyle = {
  display: "flex",
  gap: "8px",
  marginBottom: "20px",
  flexWrap: "wrap",
};
const cardStyle = {
  backgroundColor: "#fff",
  padding: "20px",
  borderRadius: "12px",
  border: "1px solid #e1e4e8",
  boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
  marginBottom: "15px",
};
const reportCardStyle = {
  backgroundColor: "#fff",
  padding: "20px",
  borderRadius: "12px",
  border: "1px solid #e1e4e8",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  marginBottom: "15px",
};
const summaryCard = {
  backgroundColor: "#2c3e50",
  color: "#fff",
  padding: "25px",
  borderRadius: "12px",
  textAlign: "center",
  marginBottom: "15px",
  boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
};
const advisorCard = {
  backgroundColor: "#f0f4ff",
  border: "1px solid #d6e4ff",
  padding: "15px 20px",
  borderRadius: "12px",
  marginBottom: "15px",
};
const columnStyle = { display: "flex", flexDirection: "column", gap: "10px" };
const rowBetween = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};
const inputStyle = {
  width: "100%",
  padding: "10px",
  border: "1px solid #ddd",
  borderRadius: "8px",
  boxSizing: "border-box",
  fontSize: "14px",
  marginTop: "5px",
};
const btnStyle = {
  width: "100%",
  padding: "12px",
  backgroundColor: "#2c3e50",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  fontWeight: "bold",
  cursor: "pointer",
  fontSize: "14px",
};
const subBtnStyle = {
  padding: "6px 12px",
  fontSize: "12px",
  cursor: "pointer",
  backgroundColor: "#e1e4e8",
  border: "none",
  borderRadius: "6px",
};
const tabStyle = (active) => ({
  flex: 1,
  padding: "10px",
  backgroundColor: active ? "#2c3e50" : "#e1e4e8",
  color: active ? "#fff" : "#444",
  border: "none",
  borderRadius: "8px",
  fontWeight: "bold",
  cursor: "pointer",
  fontSize: "12px",
  minWidth: "90px",
  textAlign: "center",
});
const selectStyle = {
  padding: "6px 12px",
  borderRadius: "6px",
  border: "1px solid #ccc",
  fontSize: "14px",
  cursor: "pointer",
};
const tableWrapper = {
  maxHeight: "400px",
  overflowY: "auto",
  overflowX: "auto",
  marginTop: "10px",
  border: "1px solid #eee",
  borderRadius: "8px",
};
const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "13px",
  minWidth: "450px",
};
const thStyle = {
  position: "sticky",
  top: 0,
  backgroundColor: "#fafafa",
  padding: "10px 8px",
  borderBottom: "2px solid #ddd",
  textAlign: "left",
  color: "#555",
  zIndex: 1,
};
const tdStyle = { padding: "10px 8px", color: "#333", verticalAlign: "middle" };
const badgeStyle = {
  backgroundColor: "#e0f7fa",
  color: "#0097e6",
  padding: "4px 8px",
  borderRadius: "4px",
  fontSize: "12px",
  fontWeight: "bold",
  display: "inline-block",
};
const deleteBtnStyle = {
  padding: "4px 8px",
  backgroundColor: "#ff7675",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
  fontSize: "11px",
};
const filterBtnStyle = (active) => ({
  padding: "6px 14px",
  fontSize: "13px",
  borderRadius: "20px",
  border: active ? "none" : "1px solid #ddd",
  backgroundColor: active ? "#4A90E2" : "#fff",
  color: active ? "#fff" : "#555",
  cursor: "pointer",
  fontWeight: active ? "bold" : "normal",
});
const categoryDropdownStyle = (isUncategorized) => ({
  padding: "4px 6px",
  borderRadius: "4px",
  border: isUncategorized ? "1px solid #ff7675" : "1px solid #ddd",
  backgroundColor: isUncategorized ? "#ffeaa7" : "#f9f9f9",
  color: isUncategorized ? "#d63031" : "#333",
  fontSize: "12px",
  cursor: "pointer",
  outline: "none",
});
