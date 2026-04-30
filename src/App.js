import React, { useState, useEffect, useMemo } from "react";
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend 
} from "recharts";

const GAS_URL = "YOUR_GAS_WEB_APP_URL"; // ⚠️ 본인의 배포 URL로 변경하세요.
const TOSS_BLUE = "#3182F6";
const TOSS_BG = "#F2F4F6";
const TOSS_CARD = "#FFFFFF";
const TOSS_TEXT = "#333D4B";
const TOSS_SUBTEXT = "#8B95A1";
const COLORS = [TOSS_BLUE, "#50E3C2", "#F5A623", "#D0021B", "#9013FE", "#7ED321", "#f368e0", "#ff9f43"];

export default function App() {
  const [pin, setPin] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard"); // 기본 탭: 지출 내역
  const [data, setData] = useState([]);
  const [mappings, setMappings] = useState([]); 
  const [loading, setLoading] = useState(false);

  const fetchAPI = async (action, payload = {}) => {
    try {
      const res = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action, pin, ...payload })
      });
      return await res.json();
    } catch (e) { return { success: false, message: "서버 연결 실패" }; }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const result = await fetchAPI("login");
    if (result.success) { setIsAuthenticated(true); loadData(); }
    else { alert(result.message); }
    setLoading(false);
  };

  const loadData = async () => {
    setLoading(true);
    const result = await fetchAPI("getData");
    if (result.success) {
      const formattedData = result.data.map(d => ({ ...d, 구분: d['구분'] || '지출' }));
      setData(formattedData);
      setMappings(result.mappings || []);
    }
    setLoading(false);
  };

  const dynamicCategories = useMemo(() => {
    const fromMappings = mappings.map(m => m.category);
    const fromData = data.map(d => d['카테고리']);
    let uniqueCats = Array.from(new Set([...fromMappings, ...fromData, "미분류"])).filter(Boolean);
    uniqueCats.sort((a, b) => a === "미분류" ? 1 : b === "미분류" ? -1 : a.localeCompare(b));
    return uniqueCats;
  }, [mappings, data]);

  if (!isAuthenticated) {
    return (
      <div style={centerStyle}>
        <form onSubmit={handleLogin} style={loginCardStyle}>
          <h2 style={{ textAlign: "center", color: TOSS_TEXT }}>자산 진단 시작하기</h2>
          <p style={{ textAlign: "center", color: TOSS_SUBTEXT, fontSize: "14px", marginTop: "-10px" }}>비밀번호를 입력해주세요</p>
          <input type="password" value={pin} onChange={e => setPin(e.target.value)} style={inputStyle} placeholder="PIN 번호" />
          <button disabled={loading} style={btnStyle}>{loading ? "인증 중..." : "확인"}</button>
        </form>
      </div>
    );
  }

  return (
    <div style={appWrapperStyle}>
      <header style={headerStyle}>
        <h2 style={{ margin: 0, color: TOSS_TEXT }}>스마트 가계부 💰</h2>
        <button onClick={() => setIsAuthenticated(false)} style={subBtnStyle}>로그아웃</button>
      </header>

      <nav style={navStyle}>
        <button onClick={() => setActiveTab("dashboard")} style={tabStyle(activeTab === "dashboard")}>지출 내역</button>
        <button onClick={() => setActiveTab("assets")} style={tabStyle(activeTab === "assets")}>자산·부채</button>
        <button onClick={() => setActiveTab("report")} style={tabStyle(activeTab === "report")}>재무 리포트</button>
        <button onClick={() => setActiveTab("input")} style={tabStyle(activeTab === "input")}>입력</button>
        <button onClick={() => setActiveTab("manage")} style={tabStyle(activeTab === "manage")}>설정</button>
      </nav>

      {loading && <div style={{textAlign: "center", padding: "10px", color: TOSS_BLUE, fontWeight: "bold"}}>동기화 중... 🔄</div>}

      {activeTab === "dashboard" && <ExpenseDashboard data={data.filter(d => d['구분'] === '지출')} categories={dynamicCategories} />}
      {activeTab === "assets" && <AssetDashboard data={data.filter(d => d['구분'] === '자산' || d['구분'] === '부채' || d['구분'] === '수입')} />}
      {activeTab === "report" && <AdvisorReport data={data.filter(d => d['구분'] === '지출' || d['구분'] === '수입')} />}
      {activeTab === "input" && <ManualInput onSubmit={loadData} fetchAPI={fetchAPI} categories={dynamicCategories} />}
      {activeTab === "manage" && <CategoryManager mappings={mappings} loadData={loadData} fetchAPI={fetchAPI} />}
    </div>
  );
}

// ==========================================
// [공통] 다중 월 선택기 (토스 스타일 칩)
// ==========================================
function MonthSelector({ availableMonths, selectedMonths, setSelectedMonths }) {
  const toggleMonth = (m) => {
    if (selectedMonths.includes(m)) {
      if (selectedMonths.length > 1) setSelectedMonths(selectedMonths.filter(x => x !== m));
    } else setSelectedMonths([...selectedMonths, m]);
  };

  return (
    <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "10px", scrollbarWidth: "none" }}>
      {availableMonths.map(m => (
        <button key={m} onClick={() => toggleMonth(m)} style={chipStyle(selectedMonths.includes(m))}>
          {m}월
        </button>
      ))}
      <button onClick={() => setSelectedMonths(availableMonths)} style={textBtnStyle}>전체보기</button>
    </div>
  );
}

// ==========================================
// 1. 컴포넌트: 지출 내역 (UX 개선: 합계 + Top 10)
// ==========================================
function ExpenseDashboard({ data, categories }) {
  const availableMonths = useMemo(() => Array.from(new Set(data.map(item => String(item['날짜']).substring(0, 7)))).sort((a, b) => b.localeCompare(a)), [data]);
  const [selectedMonths, setSelectedMonths] = useState(availableMonths.length > 0 ? [availableMonths[0]] : []);
  const [activeCategory, setActiveCategory] = useState("all");

  const filteredData = useMemo(() => data.filter(item => selectedMonths.includes(String(item['날짜']).substring(0, 7))), [data, selectedMonths]);
  
  const totalExpense = useMemo(() => filteredData.reduce((sum, item) => sum + Number(item['금액']), 0), [filteredData]);

  const categoryStats = useMemo(() => {
    const map = {};
    filteredData.forEach(item => map[item['카테고리']] = (map[item['카테고리']] || 0) + Number(item['금액']));
    return Object.keys(map).map(k => ({ name: k, value: map[k] })).sort((a, b) => b.value - a.value);
  }, [filteredData]);

  // 카테고리 클릭 시 Top 10 추출
  const top10Items = useMemo(() => {
    if (activeCategory === "all") return [];
    return filteredData
      .filter(item => item['카테고리'] === activeCategory)
      .sort((a, b) => Number(b['금액']) - Number(a['금액']))
      .slice(0, 10);
  }, [filteredData, activeCategory]);

  return (
    <div style={columnStyle}>
      <MonthSelector availableMonths={availableMonths} selectedMonths={selectedMonths} setSelectedMonths={setSelectedMonths} />

      {/* 총 지출 합계 (토스 스타일 Big Number) */}
      <div style={cardStyle}>
        <p style={{ color: TOSS_SUBTEXT, margin: "0 0 5px 0", fontSize: "14px" }}>선택 기간 총 지출</p>
        <h1 style={{ color: TOSS_TEXT, margin: 0, fontSize: "28px" }}>{totalExpense.toLocaleString()}원</h1>
      </div>

      {/* 카테고리별 그리드 (클릭 시 액션) */}
      <h4 style={{ margin: "10px 0 0 5px", color: TOSS_TEXT }}>어디에 가장 많이 썼을까요?</h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "12px" }}>
        {categoryStats.map((stat, i) => (
          <div 
            key={stat.name} 
            onClick={() => setActiveCategory(activeCategory === stat.name ? "all" : stat.name)}
            style={{ 
              backgroundColor: activeCategory === stat.name ? "#E8F3FF" : TOSS_CARD, 
              border: activeCategory === stat.name ? `1px solid ${TOSS_BLUE}` : "1px solid transparent",
              padding: "16px", borderRadius: "16px", cursor: "pointer",
              boxShadow: "0 4px 10px rgba(0,0,0,0.03)", transition: "0.2s"
            }}
          >
            <div style={{ fontSize: "13px", color: activeCategory === stat.name ? TOSS_BLUE : TOSS_SUBTEXT, marginBottom: "8px", fontWeight: "bold" }}>
              {stat.name}
            </div>
            <div style={{ fontSize: "18px", fontWeight: "800", color: TOSS_TEXT }}>
              {stat.value.toLocaleString()}원
            </div>
          </div>
        ))}
      </div>

      {/* 선택된 카테고리 지출 Top 10 (리스트 UI) */}
      {activeCategory !== "all" && (
        <div style={{...cardStyle, marginTop: "10px", border: `2px solid ${TOSS_BLUE}`}}>
          <h4 style={{ margin: "0 0 15px 0", color: TOSS_BLUE }}>💡 '{activeCategory}' 지출 Top 10</h4>
          {top10Items.map((item, idx) => (
            <div key={idx} style={listItemStyle}>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <div style={rankBadgeStyle}>{idx + 1}</div>
                <div>
                  <div style={{ fontWeight: "bold", color: TOSS_TEXT, fontSize: "15px" }}>{item['사용처']}</div>
                  <div style={{ color: TOSS_SUBTEXT, fontSize: "12px", marginTop: "2px" }}>{item['날짜']} · {item['카드']}</div>
                </div>
              </div>
              <div style={{ fontWeight: "800", color: TOSS_TEXT, fontSize: "15px" }}>
                {Number(item['금액']).toLocaleString()}원
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// 2. 컴포넌트: 자산 및 부채 (진행률 바 추가)
// ==========================================
function AssetDashboard({ data }) {
  const assets = data.filter(d => d['구분'] === '자산');
  const liabilities = data.filter(d => d['구분'] === '부채');
  const incomes = data.filter(d => d['구분'] === '수입'); // 최근 수입 렌더링용

  const totalAssets = assets.reduce((sum, item) => sum + Number(item['금액']), 0);
  const totalLiabilities = liabilities.reduce((sum, item) => sum + Number(item['금액']), 0);
  const netWorth = totalAssets - totalLiabilities;

  return (
    <div style={columnStyle}>
      {/* 순자산 카드 */}
      <div style={{...cardStyle, backgroundColor: TOSS_BLUE, color: "#fff", border: "none"}}>
        <p style={{ margin: "0 0 5px 0", fontSize: "14px", opacity: 0.9 }}>나의 순자산</p>
        <h1 style={{ margin: 0, fontSize: "32px" }}>{netWorth.toLocaleString()}원</h1>
      </div>

      <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
        {/* 자산 목록 */}
        <div style={{...cardStyle, flex: 1, minWidth: "280px"}}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px" }}>
            <h3 style={{ margin: 0, color: TOSS_TEXT }}>자산</h3>
            <h3 style={{ margin: 0, color: TOSS_BLUE }}>{totalAssets.toLocaleString()}원</h3>
          </div>
          {assets.map((a, i) => (
            <div key={i} style={listItemStyle}>
              <div>
                <div style={{ fontWeight: "bold", color: TOSS_TEXT }}>{a['사용처']}</div>
                <div style={{ color: TOSS_SUBTEXT, fontSize: "12px" }}>{a['카테고리']}</div>
              </div>
              <div style={{ fontWeight: "bold", color: TOSS_TEXT }}>{Number(a['금액']).toLocaleString()}원</div>
            </div>
          ))}
          {assets.length === 0 && <div style={{ color: TOSS_SUBTEXT, fontSize: "13px" }}>등록된 자산이 없습니다.</div>}
        </div>

        {/* 부채 목록 (Progress Bar 포함) */}
        <div style={{...cardStyle, flex: 1, minWidth: "280px"}}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px" }}>
            <h3 style={{ margin: 0, color: TOSS_TEXT }}>부채</h3>
            <h3 style={{ margin: 0, color: "#E74C3C" }}>{totalLiabilities.toLocaleString()}원</h3>
          </div>
          {liabilities.map((l, i) => {
            const current = Number(l['금액']);
            const initial = Number(l['메모']) || current; // 메모에 초기 원금을 적었다고 가정
            let progress = initial > 0 ? ((initial - current) / initial) * 100 : 0;
            if (progress < 0) progress = 0;

            return (
              <div key={i} style={{ ...listItemStyle, flexDirection: "column", alignItems: "stretch", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: "bold", color: TOSS_TEXT }}>{l['사용처']}</div>
                    <div style={{ color: TOSS_SUBTEXT, fontSize: "12px" }}>남은 원금: {current.toLocaleString()}원</div>
                  </div>
                  <div style={{ fontWeight: "bold", color: "#E74C3C" }}>{progress.toFixed(1)}% 상환</div>
                </div>
                {/* 상환 진행률 바 */}
                {initial > current && (
                  <div style={progressBarContainer}>
                    <div style={{...progressBarFill, width: `${progress}%`}}></div>
                  </div>
                )}
              </div>
            );
          })}
          {liabilities.length === 0 && <div style={{ color: TOSS_SUBTEXT, fontSize: "13px" }}>등록된 부채가 없습니다. 훌륭합니다!</div>}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 3. 컴포넌트: 재무 리포트 (기존 유지, 스타일만 토스풍)
// ==========================================
function AdvisorReport({ data }) {
  // 이전과 완벽히 동일한 로직, 디자인만 약간 변경
  const availableMonths = useMemo(() => Array.from(new Set(data.map(item => String(item['날짜']).substring(0, 7)))).sort((a, b) => b.localeCompare(a)), [data]);
  const [selectedMonths, setSelectedMonths] = useState(availableMonths.length > 0 ? [availableMonths[0]] : []);

  const reportStats = useMemo(() => {
    if (selectedMonths.length === 0) return null;
    const currentData = data.filter(item => selectedMonths.includes(String(item['날짜']).substring(0, 7)));
    let totalIncome = 0, totalExpense = 0, givingTotal = 0, fixedTotal = 0;
    currentData.forEach(item => {
      const amt = Number(item['금액']);
      if (item['구분'] === '수입') totalIncome += amt;
      else {
        totalExpense += amt;
        if (['십일조', '헌금', '컴패션', '후원', '기부'].includes(item['카테고리'])) givingTotal += amt;
        if (['주거/통신', '관리비', '보험료', '대출 상환금', '주거이자'].includes(item['카테고리'])) fixedTotal += amt;
      }
    });
    return { totalIncome, totalExpense, givingTotal, fixedTotal };
  }, [data, selectedMonths]);

  if (!reportStats) return <div style={cardStyle}>데이터가 없습니다.</div>;
  const fixedRatio = reportStats.totalExpense > 0 ? ((reportStats.fixedTotal / reportStats.totalExpense) * 100).toFixed(1) : 0;

  return (
    <div style={columnStyle}>
      <MonthSelector availableMonths={availableMonths} selectedMonths={selectedMonths} setSelectedMonths={setSelectedMonths} />
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 15px 0", color: TOSS_TEXT }}>👨‍💼 재무 진단 리포트</h3>
        <b style={{ color: "#E74C3C" }}>고정 지출 점검</b>
        <p style={{ fontSize: "14px", lineHeight: "1.6", color: TOSS_TEXT, marginTop: "5px" }}>
          선택 기간 동안 <b>구조적 고정 지출 비중이 {fixedRatio}%</b>({reportStats.fixedTotal.toLocaleString()}원) 입니다. <br/>
          {fixedRatio > 50 ? "고정 지출(관리비, 통신비 등) 비중이 매우 높습니다. 지출 다이어트의 1순위는 변동비가 아닌 고정비입니다. 통신비 알뜰폰 전환, 안 쓰는 구독 서비스 해지를 추천합니다." : "고정 지출이 안정적으로 유지되고 있습니다."}
        </p>
      </div>
    </div>
  );
}

// ==========================================
// 4. 컴포넌트: 직접 입력 (기존 유지, 힌트 개선)
// ==========================================
function ManualInput({ onSubmit, fetchAPI, categories }) {
  const [entryType, setEntryType] = useState("지출"); 
  const [form, setForm] = useState({ date: new Date().toISOString().substring(0, 10), amount: "", merchant: "", memo: "", category: "미분류" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.date || !form.amount || !form.merchant) return alert("필수 항목 확인!");
    setLoading(true);
    const result = await fetchAPI("addEntry", { record: { ...form, type: entryType, date: form.date.replace(/-/g, ".") } });
    if (result.success) { setForm({ ...form, amount: "", merchant: "", memo: "", category: "미분류" }); onSubmit(); alert("등록되었습니다!");}
    setLoading(false);
  };

  return (
    <div style={columnStyle}>
      <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
        {["지출", "수입", "자산", "부채"].map(type => (
          <button key={type} onClick={() => setEntryType(type)} style={chipStyle(entryType === type)}>{type}</button>
        ))}
      </div>
      <form onSubmit={handleSubmit} style={cardStyle}>
        <h3 style={{ marginTop: 0, color: TOSS_TEXT }}>{entryType} 등록</h3>
        <div style={columnStyle}>
          <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} style={inputStyle} />
          
          <input type="number" placeholder={entryType === "부채" ? "현재 남은 잔액 (예: 15000000)" : "금액"} value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} style={inputStyle} />
          
          <input type="text" placeholder={entryType === "자산" ? "은행명/계좌명" : entryType === "부채" ? "대출 상품명" : "사용처"} value={form.merchant} onChange={e => setForm({...form, merchant: e.target.value})} style={inputStyle} />
          
          {/* 부채 탭일 때 메모란을 '최초 원금' 입력용으로 사용 */}
          {entryType === "부채" && <input type="number" placeholder="최초 대출 원금 (진행률 계산용, 예: 20000000)" value={form.memo} onChange={e => setForm({...form, memo: e.target.value})} style={inputStyle} />}
          {entryType !== "부채" && <input type="text" placeholder="메모 (선택)" value={form.memo} onChange={e => setForm({...form, memo: e.target.value})} style={inputStyle} />}

          <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} style={inputStyle}>
            {entryType === "지출" && categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            {entryType === "수입" && ["급여", "부수입", "기타"].map(cat => <option key={cat} value={cat}>{cat}</option>)}
            {entryType === "자산" && ["예적금", "주식/펀드", "현금", "부동산"].map(cat => <option key={cat} value={cat}>{cat}</option>)}
            {entryType === "부채" && ["주택담보대출", "신용대출", "전세자금대출", "기타"].map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <button type="submit" disabled={loading} style={btnStyle}>{loading ? "처리 중..." : "등록하기"}</button>
        </div>
      </form>
    </div>
  );
}

// 5. 컴포넌트: 설정 관리 생략 (기존 CategoryManager 코드와 동일)
function CategoryManager({ mappings, loadData, fetchAPI }) {
  return <div style={cardStyle}><p style={{color: TOSS_SUBTEXT}}>기존 카테고리 관리 코드 적용 부분</p></div>;
}

// --- 토스 스타일 CSS-in-JS ---
const appWrapperStyle = { maxWidth: "600px", margin: "0 auto", padding: "16px", fontFamily: "'Pretendard', -apple-system, sans-serif", backgroundColor: TOSS_BG, minHeight: "100vh" };
const centerStyle = { display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", backgroundColor: TOSS_BG };
const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" };
const navStyle = { display: "flex", gap: "4px", marginBottom: "24px", overflowX: "auto", paddingBottom: "5px", scrollbarWidth: "none" };
const cardStyle = { backgroundColor: TOSS_CARD, padding: "24px", borderRadius: "20px", boxShadow: "0 8px 20px rgba(0,0,0,0.04)", marginBottom: "16px", border: "none" };
const loginCardStyle = { ...cardStyle, width: "100%", maxWidth: "320px", padding: "40px 24px" };
const columnStyle = { display: "flex", flexDirection: "column" };
const inputStyle = { width: "100%", padding: "16px", backgroundColor: "#F9FAFB", border: "none", borderRadius: "12px", boxSizing: "border-box", fontSize: "15px", marginTop: "8px", outline: "none", color: TOSS_TEXT };
const btnStyle = { width: "100%", padding: "16px", backgroundColor: TOSS_BLUE, color: "#fff", border: "none", borderRadius: "12px", fontWeight: "bold", cursor: "pointer", fontSize: "16px", marginTop: "16px" };
const subBtnStyle = { padding: "8px 14px", fontSize: "13px", cursor: "pointer", backgroundColor: "#E8F3FF", color: TOSS_BLUE, border: "none", borderRadius: "8px", fontWeight: "bold" };
const tabStyle = (active) => ({ flexShrink: 0, padding: "10px 16px", backgroundColor: "transparent", color: active ? TOSS_TEXT : TOSS_SUBTEXT, border: "none", borderBottom: active ? `2px solid ${TOSS_TEXT}` : "2px solid transparent", fontWeight: active ? "bold" : "normal", cursor: "pointer", fontSize: "15px", transition: "0.2s" });
const chipStyle = (active) => ({ padding: "8px 16px", borderRadius: "20px", border: "none", backgroundColor: active ? TOSS_TEXT : "#FFFFFF", color: active ? "#fff" : TOSS_SUBTEXT, cursor: "pointer", fontSize: "14px", fontWeight: active ? "bold" : "normal", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" });
const textBtnStyle = { background: "none", border: "none", color: TOSS_BLUE, cursor: "pointer", fontSize: "13px", fontWeight: "bold", padding: "8px", flexShrink: 0 };
const listItemStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: "1px solid #F2F4F6" };
const rankBadgeStyle = { width: "24px", height: "24px", backgroundColor: "#E8F3FF", color: TOSS_BLUE, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "bold" };
const progressBarContainer = { width: "100%", height: "8px", backgroundColor: "#F2F4F6", borderRadius: "4px", overflow: "hidden" };
const progressBarFill = { height: "100%", backgroundColor: TOSS_BLUE, borderRadius: "4px", transition: "width 0.5s ease" };
