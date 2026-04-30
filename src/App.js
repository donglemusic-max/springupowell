import React, { useState, useEffect, useMemo } from "react";
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend 
} from "recharts";

const GAS_URL = "https://script.google.com/macros/s/AKfycbwGEvgRwmjzMtPK2WqrmkgJvhUAJMK5qYfJYNfKETKwmtU3rlL5xxRl_T422zFzMvu3/exec"; // ⚠️ 본인의 배포 URL로 변경하세요.
const TOSS_BLUE = "#3182F6";
const TOSS_BG = "#F2F4F6";
const TOSS_CARD = "#FFFFFF";
const TOSS_TEXT = "#333D4B";
const TOSS_SUBTEXT = "#8B95A1";
const COLORS = [TOSS_BLUE, "#50E3C2", "#F5A623", "#D0021B", "#9013FE", "#7ED321", "#f368e0", "#ff9f43"];

export default function App() {
  const [pin, setPin] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard"); 
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
      // '삭제됨'으로 처리된 내역은 프론트엔드에서 완전히 걸러냄 (원본 비파괴 삭제 로직)
      const formattedData = result.data
        .filter(d => d['카테고리'] !== '삭제됨')
        .map(d => ({ ...d, 구분: d['구분'] || '지출' }));
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

      {activeTab === "dashboard" && <ExpenseDashboard data={data.filter(d => d['구분'] === '지출')} setData={setData} fetchAPI={fetchAPI} categories={dynamicCategories} />}
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
// 1. 컴포넌트: 지출 내역 (합계 상위 노출 + 카테고리 즉시 변경/삭제)
// ==========================================
function ExpenseDashboard({ data, setData, fetchAPI, categories }) {
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

  // ★ 변경됨: 동일한 사용처(가맹점명)일 경우 금액을 '합산'하여 Top 10 랭킹 산출
  const top10ItemsAggregated = useMemo(() => {
    if (activeCategory === "all") return [];
    const items = filteredData.filter(item => item['카테고리'] === activeCategory);
    const map = {};
    items.forEach(item => {
      const merchant = item['사용처'];
      map[merchant] = (map[merchant] || 0) + Number(item['금액']);
    });
    return Object.keys(map)
      .map(merchant => ({ merchant, amount: map[merchant] }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }, [filteredData, activeCategory]);

  // 테이블 상세 데이터
  const finalTableData = useMemo(() => {
    if (activeCategory === "all") return filteredData;
    return filteredData.filter(item => item['카테고리'] === activeCategory);
  }, [filteredData, activeCategory]);

  // 카테고리 즉시 변경 로직
  const handleCategoryChange = async (item, newCategory) => {
    setData(data.map(d => (d['날짜'] === item['날짜'] && d['금액'] === item['금액'] && d['사용처'] === item['사용처']) ? { ...d, 카테고리: newCategory } : d));
    await fetchAPI("updateCategory", { record: { date: item['날짜'], amount: item['금액'], merchant: item['사용처'], category: newCategory } });
  };

  // 내역 즉시 삭제 로직 (수정 내역 시트에 '삭제됨'으로 예외 처리 등록)
  const handleDelete = async (item) => {
    if(!window.confirm(`'${item['사용처']}' 내역을 삭제하시겠습니까?`)) return;
    setData(data.filter(d => !(d['날짜'] === item['날짜'] && d['금액'] === item['금액'] && d['사용처'] === item['사용처'])));
    await fetchAPI("updateCategory", { record: { date: item['날짜'], amount: item['금액'], merchant: item['사용처'], category: '삭제됨' } });
  };

  return (
    <div style={columnStyle}>
      <MonthSelector availableMonths={availableMonths} selectedMonths={selectedMonths} setSelectedMonths={setSelectedMonths} />

      {/* 총 지출 합계 */}
      <div style={cardStyle}>
        <p style={{ color: TOSS_SUBTEXT, margin: "0 0 5px 0", fontSize: "14px" }}>선택 기간 총 지출</p>
        <h1 style={{ color: TOSS_TEXT, margin: 0, fontSize: "28px" }}>{totalExpense.toLocaleString()}원</h1>
      </div>

      {/* 카테고리 그리드 (클릭 시 액션) */}
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

      {/* 선택된 카테고리 지출 Top 10 (합산된 결과) */}
      {activeCategory !== "all" && top10ItemsAggregated.length > 0 && (
        <div style={{...cardStyle, marginTop: "10px", border: `2px solid ${TOSS_BLUE}`}}>
          <h4 style={{ margin: "0 0 15px 0", color: TOSS_BLUE }}>💡 '{activeCategory}' 사용처 Top 10 (합산)</h4>
          {top10ItemsAggregated.map((item, idx) => (
            <div key={idx} style={listItemStyle}>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <div style={rankBadgeStyle}>{idx + 1}</div>
                <div style={{ fontWeight: "bold", color: TOSS_TEXT, fontSize: "15px" }}>{item.merchant}</div>
              </div>
              <div style={{ fontWeight: "800", color: TOSS_TEXT, fontSize: "15px" }}>
                {Number(item.amount).toLocaleString()}원
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 전체 상세 내역 (카테고리 수정/삭제 기능 복구) */}
      <div style={{...cardStyle, marginTop: "10px"}}>
        <h4 style={{ margin: "0 0 15px 0", color: TOSS_TEXT }}>
          {activeCategory === "all" ? "전체 지출 상세 내역" : `'${activeCategory}' 상세 내역`}
        </h4>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "450px" }}>
            <thead>
              <tr>
                <th style={thStyle}>날짜</th>
                <th style={thStyle}>사용처</th>
                <th style={thStyle}>카테고리 (변경가능)</th>
                <th style={{ ...thStyle, textAlign: "right" }}>금액</th>
                <th style={{ ...thStyle, textAlign: "center" }}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {finalTableData.map((item, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f1f1f1" }}>
                  <td style={tdStyle}>{item['날짜']}</td>
                  <td style={tdStyle}>{item['사용처']}</td>
                  <td style={tdStyle}>
                    <select 
                      value={item['카테고리']} 
                      onChange={(e) => handleCategoryChange(item, e.target.value)} 
                      style={categoryDropdownStyle(item['카테고리'] === "미분류")}
                    >
                      {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: "bold", color: TOSS_TEXT }}>{Number(item['금액']).toLocaleString()}원</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <button onClick={() => handleDelete(item)} style={deleteIconBtnStyle}>✕</button>
                  </td>
                </tr>
              ))}
              {finalTableData.length === 0 && <tr><td colSpan="5" style={{ textAlign: "center", padding: "20px", color: TOSS_SUBTEXT }}>내역이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2. 컴포넌트: 자산 및 부채 (진행률 바)
// ==========================================
function AssetDashboard({ data }) {
  const assets = data.filter(d => d['구분'] === '자산');
  const liabilities = data.filter(d => d['구분'] === '부채');

  const totalAssets = assets.reduce((sum, item) => sum + Number(item['금액']), 0);
  const totalLiabilities = liabilities.reduce((sum, item) => sum + Number(item['금액']), 0);
  const netWorth = totalAssets - totalLiabilities;

  return (
    <div style={columnStyle}>
      <div style={{...cardStyle, backgroundColor: TOSS_BLUE, color: "#fff", border: "none"}}>
        <p style={{ margin: "0 0 5px 0", fontSize: "14px", opacity: 0.9 }}>나의 순자산</p>
        <h1 style={{ margin: 0, fontSize: "32px" }}>{netWorth.toLocaleString()}원</h1>
      </div>

      <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
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
        </div>

        <div style={{...cardStyle, flex: 1, minWidth: "280px"}}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px" }}>
            <h3 style={{ margin: 0, color: TOSS_TEXT }}>부채</h3>
            <h3 style={{ margin: 0, color: "#E74C3C" }}>{totalLiabilities.toLocaleString()}원</h3>
          </div>
          {liabilities.map((l, i) => {
            const current = Number(l['금액']);
            const initial = Number(l['메모']) || current; 
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
                {initial > current && (
                  <div style={progressBarContainer}>
                    <div style={{...progressBarFill, width: `${progress}%`}}></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 3. 컴포넌트: 기독교 재무 어드바이저 리포트
// ==========================================
function AdvisorReport({ data }) {
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
  const givingRatio = reportStats.totalExpense > 0 ? ((reportStats.givingTotal / reportStats.totalExpense) * 100).toFixed(1) : 0;
  const fixedRatio = reportStats.totalExpense > 0 ? ((reportStats.fixedTotal / reportStats.totalExpense) * 100).toFixed(1) : 0;

  return (
    <div style={columnStyle}>
      <MonthSelector availableMonths={availableMonths} selectedMonths={selectedMonths} setSelectedMonths={setSelectedMonths} />
      
      <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
        <div style={{...cardStyle, flex: 1, textAlign: "center"}}>
          <p style={{ margin: "0 0 5px 0", color: TOSS_SUBTEXT, fontSize: "14px" }}>합산 수입</p>
          <h2 style={{ margin: 0, color: TOSS_BLUE }}>{reportStats.totalIncome.toLocaleString()}원</h2>
        </div>
        <div style={{...cardStyle, flex: 1, textAlign: "center"}}>
          <p style={{ margin: "0 0 5px 0", color: TOSS_SUBTEXT, fontSize: "14px" }}>합산 지출</p>
          <h2 style={{ margin: 0, color: "#E74C3C" }}>{reportStats.totalExpense.toLocaleString()}원</h2>
        </div>
      </div>

      <div style={{...cardStyle, padding: "24px"}}>
        <h3 style={{ margin: "0 0 15px 0", color: TOSS_TEXT }}>👨‍💼 재무 진단 리포트</h3>
        
        <b style={{ color: "#d35400" }}>나눔과 헌신 (Giving)</b>
        <p style={{ fontSize: "14px", lineHeight: "1.6", color: TOSS_TEXT, marginTop: "5px", marginBottom: "20px" }}>
          선택 기간 나눔 비중은 <b>{givingRatio}%</b>({reportStats.givingTotal.toLocaleString()}원) 입니다. <br/>
          <span style={quoteStyle}>"할 수 있는 한 모든 방법으로, 모든 사람에게 선을 행하십시오." — 존 웨슬리</span>
        </p>

        <b style={{ color: "#E74C3C" }}>고정 지출 점검</b>
        <p style={{ fontSize: "14px", lineHeight: "1.6", color: TOSS_TEXT, marginTop: "5px" }}>
          <b>구조적 고정 지출 비중이 {fixedRatio}%</b>({reportStats.fixedTotal.toLocaleString()}원) 입니다. <br/>
          {fixedRatio > 50 ? "고정 지출 비중이 높습니다. 재정 유동성 확보를 위해 통신비 알뜰폰 전환 등을 추천합니다." : "고정 지출이 안정적으로 유지되고 있습니다."}
        </p>
      </div>
    </div>
  );
}

// ==========================================
// 4. 컴포넌트: 데이터 입력
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
          <input type="number" placeholder={entryType === "부채" ? "현재 남은 빚 (예: 15000000)" : "금액"} value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} style={inputStyle} />
          <input type="text" placeholder={entryType === "자산" ? "은행명/계좌명" : entryType === "부채" ? "대출 상품명" : "사용처"} value={form.merchant} onChange={e => setForm({...form, merchant: e.target.value})} style={inputStyle} />
          
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

// ==========================================
// 5. 컴포넌트: 카테고리 관리 (기능 완전 복구)
// ==========================================
function CategoryManager({ mappings, loadData, fetchAPI }) {
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!keyword.trim() || !category.trim()) return alert("입력 오류");
    setIsProcessing(true);
    const res = await fetchAPI("saveMapping", { keyword: keyword.trim(), category: category.trim() });
    if (res.success) { setKeyword(""); setCategory(""); await loadData(); } 
    setIsProcessing(false);
  };

  const handleDelete = async (kw) => {
    if (!window.confirm(`'${kw}' 규칙을 삭제하시겠습니까?`)) return;
    setIsProcessing(true);
    const res = await fetchAPI("deleteMapping", { keyword: kw });
    if (res.success) await loadData();
    setIsProcessing(false);
  };

  return (
    <div style={columnStyle}>
      <form onSubmit={handleSave} style={{...cardStyle, display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap"}}>
        <div style={{ flex: 1, minWidth: "130px" }}>
          <label style={{fontSize: "12px", color: TOSS_SUBTEXT}}>가맹점 키워드</label>
          <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)} style={inputStyle} placeholder="예: 네이버페이" />
        </div>
        <div style={{ flex: 1, minWidth: "130px" }}>
          <label style={{fontSize: "12px", color: TOSS_SUBTEXT}}>분류할 카테고리</label>
          <input type="text" value={category} onChange={e => setCategory(e.target.value)} style={inputStyle} placeholder="예: 생활용품" />
        </div>
        <button type="submit" disabled={isProcessing} style={{...btnStyle, width: "auto", padding: "16px 20px", marginTop: 0}}>저장</button>
      </form>

      <div style={cardStyle}>
        <h4 style={{ margin: "0 0 15px 0", color: TOSS_TEXT }}>등록된 매핑 규칙 ({mappings.length}건)</h4>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead><tr><th style={thStyle}>키워드</th><th style={thStyle}>카테고리</th><th style={thStyle}>관리</th></tr></thead>
            <tbody>
              {mappings.map((m, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f1f1f1" }}>
                  <td style={tdStyle}>{m.keyword}</td>
                  <td style={tdStyle}><span style={{...badgeStyle, backgroundColor: "#E8F3FF", color: TOSS_BLUE}}>{m.category}</span></td>
                  <td style={tdStyle}><button onClick={() => handleDelete(m.keyword)} style={deleteIconBtnStyle}>삭제</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- 토스 스타일 CSS-in-JS ---
const appWrapperStyle = { maxWidth: "600px", margin: "0 auto", padding: "16px", fontFamily: "'Pretendard', -apple-system, sans-serif", backgroundColor: TOSS_BG, minHeight: "100vh" };
const centerStyle = { display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", backgroundColor: TOSS_BG };
const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" };
const navStyle = { display: "flex", gap: "4px", marginBottom: "24px", overflowX: "auto", paddingBottom: "5px", scrollbarWidth: "none", whiteSpace: "nowrap" };
const cardStyle = { backgroundColor: TOSS_CARD, padding: "24px", borderRadius: "20px", boxShadow: "0 8px 20px rgba(0,0,0,0.04)", marginBottom: "16px", border: "none" };
const loginCardStyle = { ...cardStyle, width: "100%", maxWidth: "320px", padding: "40px 24px" };
const columnStyle = { display: "flex", flexDirection: "column" };
const inputStyle = { width: "100%", padding: "16px", backgroundColor: "#F9FAFB", border: "none", borderRadius: "12px", boxSizing: "border-box", fontSize: "15px", marginTop: "8px", outline: "none", color: TOSS_TEXT };
const btnStyle = { width: "100%", padding: "16px", backgroundColor: TOSS_BLUE, color: "#fff", border: "none", borderRadius: "12px", fontWeight: "bold", cursor: "pointer", fontSize: "16px", marginTop: "16px" };
const subBtnStyle = { padding: "8px 14px", fontSize: "13px", cursor: "pointer", backgroundColor: "#E8F3FF", color: TOSS_BLUE, border: "none", borderRadius: "8px", fontWeight: "bold" };
const tabStyle = (active) => ({ flexShrink: 0, padding: "10px 16px", backgroundColor: "transparent", color: active ? TOSS_TEXT : TOSS_SUBTEXT, border: "none", borderBottom: active ? `2px solid ${TOSS_TEXT}` : "2px solid transparent", fontWeight: active ? "bold" : "normal", cursor: "pointer", fontSize: "15px", transition: "0.2s" });
const chipStyle = (active) => ({ padding: "8px 16px", borderRadius: "20px", border: active ? `1px solid ${TOSS_TEXT}` : "1px solid #ddd", backgroundColor: active ? TOSS_TEXT : "#FFFFFF", color: active ? "#fff" : TOSS_SUBTEXT, cursor: "pointer", fontSize: "14px", fontWeight: active ? "bold" : "normal", flexShrink: 0 });
const textBtnStyle = { background: "none", border: "none", color: TOSS_BLUE, cursor: "pointer", fontSize: "13px", fontWeight: "bold", padding: "8px", flexShrink: 0 };
const listItemStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: "1px solid #F2F4F6" };
const rankBadgeStyle = { width: "24px", height: "24px", backgroundColor: "#E8F3FF", color: TOSS_BLUE, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "bold" };
const progressBarContainer = { width: "100%", height: "8px", backgroundColor: "#F2F4F6", borderRadius: "4px", overflow: "hidden" };
const progressBarFill = { height: "100%", backgroundColor: TOSS_BLUE, borderRadius: "4px", transition: "width 0.5s ease" };
const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "450px" };
const thStyle = { padding: "10px 8px", borderBottom: "2px solid #ddd", textAlign: "left", color: TOSS_SUBTEXT };
const tdStyle = { padding: "10px 8px", color: TOSS_TEXT, verticalAlign: "middle" };
const categoryDropdownStyle = (isUncategorized) => ({ padding: "6px 8px", borderRadius: "6px", border: isUncategorized ? "1px solid #ff7675" : "1px solid #ddd", backgroundColor: isUncategorized ? "#ffeaa7" : "#F9FAFB", color: isUncategorized ? "#d63031" : TOSS_TEXT, fontSize: "13px", cursor: "pointer", outline: "none" });
const deleteIconBtnStyle = { padding: "6px 10px", backgroundColor: "#ff7675", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" };
const badgeStyle = { backgroundColor: "#e0f7fa", color: "#0097e6", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "bold", display: "inline-block" };
const quoteStyle = { color: TOSS_SUBTEXT, fontStyle: "italic", display: "block", marginTop: "5px", padding: "12px", backgroundColor: TOSS_BG, borderRadius: "8px" };
