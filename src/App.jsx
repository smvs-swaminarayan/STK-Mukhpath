import React, { useState, useEffect, useMemo } from 'react';
import { 
  db, 
  seedAllCollectionsToFirebase,
  saveVachanamrutDoc,
  deleteVachanamrutDoc,
  saveKirtanDoc,
  deleteKirtanDoc,
  saveMemberDoc,
  deleteMemberDoc,
  saveGroupDoc,
  deleteGroupDoc,
  saveCustomReportDoc,
  deleteCustomReportDoc,
  saveSettingsDoc,
  addEntriesToFirebase, 
  deleteEntryFromFirebase,
  softDeleteEntryInFirebase,
  restoreEntryInFirebase,
  bulkDeleteEntriesFromFirebase,
  VACHANAMRUT_COL,
  KIRTAN_COL,
  MEMBER_COL,
  GROUP_COL,
  ENTRIES_COL,
  SETTINGS_COL,
  CUSTOM_REPORTS_COL
} from './firebase';
import { 
  doc, 
  collection, 
  onSnapshot, 
  query 
} from 'firebase/firestore';
import { 
  DEFAULT_SWAMIS, 
  DEFAULT_MUKTOS, 
  DEFAULT_STANDUP_GROUPS, 
  VACHANAMRUTS, 
  KIRTANS 
} from './data/masterData';

function TrashIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
  );
}

export default function App() {
  // ================= PORTAL AUTH & UI STATE =================
  const [role, setRole] = useState(() => localStorage.getItem('SMVS_PORTAL_ROLE') || 'mukto');
  const [activeTab, setActiveTab] = useState('entry');
  const [lang, setLang] = useState(() => localStorage.getItem('SMVS_PORTAL_LANG') || 'gu');
  const [theme, setTheme] = useState(() => localStorage.getItem('SMVS_PORTAL_THEME') || 'blue');
  const [isGatewayOpen, setIsGatewayOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [firebaseStatus, setFirebaseStatus] = useState('syncing');

  // ================= DEDICATED FIREBASE COLLECTIONS STATE =================
  const [vachanamrutsList, setVachanamrutsList] = useState(() => {
    try {
      const s = localStorage.getItem('FB_VACHANAMRUTS');
      if (s) return JSON.parse(s);
    } catch(e) {}
    return VACHANAMRUTS;
  });

  const [kirtansList, setKirtansList] = useState(() => {
    try {
      const s = localStorage.getItem('FB_KIRTANS');
      if (s) return JSON.parse(s);
    } catch(e) {}
    return KIRTANS;
  });

  const [membersList, setMembersList] = useState(() => {
    try {
      const s = localStorage.getItem('FB_MEMBERS');
      if (s) return JSON.parse(s);
    } catch(e) {}
    return [
      ...DEFAULT_SWAMIS.map((s, idx) => ({ id: `swami_${idx}`, ...s, role: 'SWAMI' })),
      ...DEFAULT_MUKTOS.map((m, idx) => ({ id: `mukto_${idx}`, ...m, role: 'MUKTO' }))
    ];
  });

  const [groupsList, setGroupsList] = useState(() => {
    try {
      const s = localStorage.getItem('FB_GROUPS');
      if (s) return JSON.parse(s);
    } catch(e) {}
    return DEFAULT_STANDUP_GROUPS;
  });

  const [entries, setEntries] = useState(() => {
    try {
      const s = localStorage.getItem('FB_ENTRIES');
      if (s) return JSON.parse(s);
    } catch(e) {}
    return [];
  });

  const [authSettings, setAuthSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('SMVS_PORTAL_AUTH');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      adminPin: '1234',
      muktoPin: '0000',
      requireMuktoPin: false
    };
  });

  // Derived Swamis & Muktos
  const swamisList = useMemo(() => membersList.filter(m => m.role === 'SWAMI'), [membersList]);
  const muktosList = useMemo(() => membersList.filter(m => m.role === 'MUKTO'), [membersList]);

  // ================= FORM & FILTER STATES =================
  const [fGiver, setFGiver] = useState('');
  const [fTaker, setFTaker] = useState('');
  const [fDate, setFDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [entryRows, setEntryRows] = useState([
    { id: 1, type: 'વચનામૃત', num: 1, marks: 5, note: '' },
    { id: 2, type: 'કીર્તન', num: 1, marks: 5, note: '' }
  ]);

  // ================= CUSTOM BRANDING & TITLES =================
  const [appGreeting, setAppGreeting] = useState(() => localStorage.getItem('SMVS_APP_GREETING') || '॥ જય સ્વામિનારાયણ ॥');
  const [appBrandTitle, setAppBrandTitle] = useState(() => localStorage.getItem('SMVS_APP_BRAND_TITLE') || '🌸 મુખપાઠ ટ્રેકર');
  const [portalBannerTitle, setPortalBannerTitle] = useState(() => localStorage.getItem('SMVS_PORTAL_BANNER_TITLE') || 'SMVS મુખપાઠ કેન્દ્રીય પોર્ટલ');

  const [admGreetingInput, setAdmGreetingInput] = useState(appGreeting);
  const [admBrandTitleInput, setAdmBrandTitleInput] = useState(appBrandTitle);
  const [admPortalBannerInput, setAdmPortalBannerInput] = useState(portalBannerTitle);

  // Translation & Name Helpers (Full Bilingual Support)
  const t = (guText, enText) => lang === 'gu' ? guText : enText;

  const getMemberName = (nameOrObj) => {
    if (!nameOrObj) return '';
    if (typeof nameOrObj === 'object') {
      return (lang === 'en' && nameOrObj.en) ? nameOrObj.en : (nameOrObj.gu || nameOrObj.en || '');
    }
    if (lang === 'en') {
      const found = membersList.find(x => x.gu === nameOrObj || x.en === nameOrObj);
      if (found && found.en) return found.en;
    }
    return nameOrObj;
  };

  const getLeaderName = (g) => {
    if (!g) return '';
    if (typeof g === 'string') {
      if (lang === 'en') {
        const found = groupsList.find(x => x.leader === g);
        if (found && found.leaderEn) return found.leaderEn;
      }
      return g;
    }
    return (lang === 'en' && g.leaderEn) ? g.leaderEn : (g.leader || '');
  };

  // Standup Leader Report Range & Filter States
  const [suStartDate, setSuStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [suEndDate, setSuEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [suLeaderFilter, setSuLeaderFilter] = useState('ALL');

  // All Records Filter States (with Date Range & Rankwise Mode)
  const [recSearch, setRecSearch] = useState('');
  const [recTypeFilter, setRecTypeFilter] = useState('ALL');
  const [recGiverFilter, setRecGiverFilter] = useState('ALL');
  const [recStartDate, setRecStartDate] = useState('');
  const [recEndDate, setRecEndDate] = useState('');
  const [recordViewMode, setRecordViewMode] = useState('list'); // 'list' | 'rankwise'
  const [rankSortBy, setRankSortBy] = useState('marks'); // 'marks' | 'count' | 'vach' | 'kirtan'
  const [rankRoleFilter, setRankRoleFilter] = useState('ALL'); // 'ALL' | 'SANTO' | 'MUKTO'

  // Quick Date Range Preset Setter
  const setDatePreset = (preset, target = 'standup') => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    let startStr = todayStr;
    let endStr = todayStr;

    if (preset === 'today') {
      startStr = todayStr;
      endStr = todayStr;
    } else if (preset === 'week') {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      startStr = monday.toISOString().split('T')[0];
      endStr = todayStr;
    } else if (preset === 'month') {
      const d = new Date();
      d.setDate(1);
      startStr = d.toISOString().split('T')[0];
      endStr = todayStr;
    } else if (preset === 'all') {
      startStr = '';
      endStr = '';
    }

    if (target === 'standup') {
      setSuStartDate(startStr);
      setSuEndDate(endStr);
    } else {
      setRecStartDate(startStr);
      setRecEndDate(endStr);
    }
  };

  // 12 Beautiful Devotional Theme Colors
  const THEME_COLORS = [
    { id: 'blue', nameGu: 'રોયલ બ્લુ', nameEn: 'Royal Blue', color: '#1a4971' },
    { id: 'maroon', nameGu: 'ભક્તિ મરૂન', nameEn: 'Devotional Maroon', color: '#6b1414' },
    { id: 'green', nameGu: 'વેદિક ગ્રીન', nameEn: 'Vedic Green', color: '#186028' },
    { id: 'gold', nameGu: 'ગોલ્ડન અંબર', nameEn: 'Golden Amber', color: '#c2850a' },
    { id: 'purple', nameGu: 'અધ્યાત્મ પર્પલ', nameEn: 'Spiritual Purple', color: '#592274' },
    { id: 'slate', nameGu: 'મોડર્ન સ્લેટ', nameEn: 'Modern Slate', color: '#2d3748' },
    { id: 'crimson', nameGu: 'ભગવા કિરમજી', nameEn: 'Temple Crimson', color: '#c2410c' },
    { id: 'teal', nameGu: 'મયૂર ટીલ', nameEn: 'Sacred Teal', color: '#0f766e' },
    { id: 'indigo', nameGu: 'દિવ્ય ઇન્ડિગો', nameEn: 'Divine Indigo', color: '#3730a3' },
    { id: 'rose', nameGu: 'ગુલાબી રોઝ', nameEn: 'Bhakti Rose', color: '#be185d' },
    { id: 'emerald', nameGu: 'શુદ્ધ પન્ના', nameEn: 'Pure Emerald', color: '#047857' },
    { id: 'midnight', nameGu: 'મિડનાઇટ નેવી', nameEn: 'Midnight Navy', color: '#0f172a' }
  ];
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  // Configurable Max Marks (Default 5, can be 10, 20, etc.)
  const [maxMarks, setMaxMarks] = useState(5);
  const [admMaxMarksInput, setAdmMaxMarksInput] = useState(5);
  const [allowMuktoDelete, setAllowMuktoDelete] = useState(true);
  const [admAllowMuktoDeleteInput, setAdmAllowMuktoDeleteInput] = useState(true);

  // Dynamic Marks Dropdown Options based on Max Marks
  const marksOptions = useMemo(() => {
    const m = parseFloat(maxMarks) || 5;
    const step = m > 10 ? 1 : 0.5;
    const list = [];
    for (let v = m; v >= 0; v = Math.round((v - step) * 10) / 10) {
      list.push(v);
    }
    return list;
  }, [maxMarks]);

  // Multi-Select Bulk Delete in Records & Archive Filter
  const [selectedRecordIds, setSelectedRecordIds] = useState([]);
  const [recordFilterStatus, setRecordFilterStatus] = useState('active'); // 'active' | 'archived' | 'all'

  // Anukramanika Search & Filter States (Image 1)
  const [anukTypeFilter, setAnukTypeFilter] = useState('ALL'); // 'ALL' | 'વચનામૃત' | 'કીર્તન'
  const [anukClassFilter, setAnukClassFilter] = useState('ALL'); // 'ALL' | 'ફરજિયાત' | 'વિશેષ'
  const [anukSearch, setAnukSearch] = useState('');
  const [quickEntryItem, setQuickEntryItem] = useState(null);
  const [quickMarks, setQuickMarks] = useState(5);
  const [quickNote, setQuickNote] = useState('');

  // Summary Tab View & Double Bar Graph (Image 2)
  const [summarySubTab, setSummarySubTab] = useState('overview'); // 'overview' | 'graph' | 'personal' | 'groups'
  const [summarySelectedPerson, setSummarySelectedPerson] = useState('');
  const [summarySortBy, setSummarySortBy] = useState('marks'); // 'marks' | 'count' | 'vach' | 'kirtan' | 'name'
  const [summarySearch, setSummarySearch] = useState('');
  const [barGraphView, setBarGraphView] = useState('devotees'); // 'devotees' (default) | 'groups' | 'marks'
  const [barGraphMetric, setBarGraphMetric] = useState('marks'); // 'marks' | 'count'
  const [graphTheme, setGraphTheme] = useState('green'); // 'green' | 'sapphire' | 'gold'
  const [graphStyle, setGraphStyle] = useState('bars'); // 'bars' | 'donut'

  // Automatic Background Color Cycler (Every 2 seconds - Image 5 request)
  const BG_COLOR_PALETTES = [
    'radial-gradient(circle at 10% 20%, #fdf2f8 0%, #fce7f3 50%, #fbcfe8 100%)', // 1. Soft Rose / Pink (Image 5)
    'radial-gradient(circle at 10% 20%, #fff7ed 0%, #ffedd5 50%, #fef3c7 100%)', // 2. Saffron / Peach
    'radial-gradient(circle at 10% 20%, #eff6ff 0%, #dbeafe 50%, #bfdbfe 100%)', // 3. Royal Sky Blue
    'radial-gradient(circle at 10% 20%, #f0fdf4 0%, #dcfce7 50%, #bbf7d0 100%)', // 4. Divine Mint Green
    'radial-gradient(circle at 10% 20%, #fefce8 0%, #fef9c3 50%, #fef08a 100%)', // 5. Golden Amber
    'radial-gradient(circle at 10% 20%, #f5f3ff 0%, #ede9fe 50%, #ddd6fe 100%)', // 6. Soft Lavender
    'radial-gradient(circle at 10% 20%, #f0fdfa 0%, #ccfbf1 50%, #99f6e4 100%)', // 7. Soft Turquoise
    'radial-gradient(circle at 10% 20%, #fff1f2 0%, #ffe4e6 50%, #fecdd3 100%)', // 8. Coral Sunset
  ];
  const [bgIndex, setBgIndex] = useState(0);
  const [autoBgEnabled, setAutoBgEnabled] = useState(() => {
    const saved = localStorage.getItem('SMVS_AUTO_BG_ENABLED');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Dynamic Custom Reports States (5 or 10 fields, customizable marks & filters)
  const REPORT_FIELDS_DEF = [
    { id: 'sr', labelGu: 'ક્રમ', labelEn: 'No.' },
    { id: 'date', labelGu: 'તારીખ', labelEn: 'Date' },
    { id: 'giver', labelGu: 'સાધકનું નામ', labelEn: 'Devotee (Giver)' },
    { id: 'taker', labelGu: 'લેનાર સંત/મુક્ત', labelEn: 'Taker' },
    { id: 'type', labelGu: 'મુખપાઠ પ્રકાર', labelEn: 'Type' },
    { id: 'num', labelGu: 'નંબર', labelEn: 'Number' },
    { id: 'title', labelGu: 'વિગત / શીર્ષક', labelEn: 'Title / Detail' },
    { id: 'marks', labelGu: 'મેળવેલ ગુણ', labelEn: 'Marks' },
    { id: 'maxMarks', labelGu: 'કુલ ગુણ (Scale)', labelEn: 'Max Marks' },
    { id: 'note', labelGu: 'વિશેષ નોંધ', labelEn: 'Note / Remarks' }
  ];

  // User-defined Extra Custom Fields (dynamically added by user)
  const [userCustomFields, setUserCustomFields] = useState(() => {
    try {
      const s = localStorage.getItem('SMVS_CUSTOM_REPORT_EXTRA_FIELDS');
      return s ? JSON.parse(s) : [];
    } catch (e) {
      return [];
    }
  });
  const [newFieldNameInput, setNewFieldNameInput] = useState('');
  const [newFieldDefaultInput, setNewFieldDefaultInput] = useState('');

  const getAllReportFields = (repCustomMeta = []) => {
    const list = [...REPORT_FIELDS_DEF];
    userCustomFields.forEach(f => {
      if (!list.some(x => x.id === f.id)) list.push(f);
    });
    if (Array.isArray(repCustomMeta)) {
      repCustomMeta.forEach(f => {
        if (!list.some(x => x.id === f.id)) list.push(f);
      });
    }
    return list;
  };

  const [customReportsList, setCustomReportsList] = useState([]);
  const [activeCustomReportId, setActiveCustomReportId] = useState(null);
  const [repTitle, setRepTitle] = useState('');
  const [repDesc, setRepDesc] = useState('');
  const [repType, setRepType] = useState('તમામ');
  const [repClass, setRepClass] = useState('બંને');
  const [repLeader, setRepLeader] = useState('તમામ');
  const [repMinMarks, setRepMinMarks] = useState(0);
  const [repMarksScale, setRepMarksScale] = useState(5); // 5 or 10 or custom
  const [repFieldCount, setRepFieldCount] = useState('10'); // '5' | '10' | 'custom'
  const [repSelectedFields, setRepSelectedFields] = useState(['sr', 'date', 'giver', 'taker', 'type', 'num', 'title', 'marks', 'maxMarks', 'note']);
  const [repAccess, setRepAccess] = useState('admin'); // 'admin' | 'mukto'
  const [custRepStartDate, setCustRepStartDate] = useState('');
  const [custRepEndDate, setCustRepEndDate] = useState('');
  const [custReportTableView, setCustReportTableView] = useState('details'); // 'details' | 'summary'

  // Standup Groups CRUD in Admin Manager
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [grpNameInput, setGrpNameInput] = useState('');
  const [grpLeaderInput, setGrpLeaderInput] = useState('');
  const [grpAddMemberInput, setGrpAddMemberInput] = useState('');

  // Admin Sub-Tab: 'vach' | 'kirtan' | 'members' | 'groups' | 'reports' | 'branding' | 'security'
  const [adminSubTab, setAdminSubTab] = useState('vach');

  // Admin Vachanamrut Form State
  const [editingVachNum, setEditingVachNum] = useState(null);
  const [vachNum, setVachNum] = useState('');
  const [vachSec, setVachSec] = useState('ગઢડા પ્રથમ');
  const [vachTitle, setVachTitle] = useState('');
  const [vachType, setVachType] = useState('ફરજિયાત');
  const [vachSearch, setVachSearch] = useState('');

  // Admin Kirtan Form State
  const [editingKirtanNum, setEditingKirtanNum] = useState(null);
  const [kirtanNum, setKirtanNum] = useState('');
  const [kirtanSec, setKirtanSec] = useState('નિત્યક્રમ');
  const [kirtanTitle, setKirtanTitle] = useState('');
  const [kirtanType, setKirtanType] = useState('ફરજિયાત');
  const [kirtanSearch, setKirtanSearch] = useState('');

  // Admin Member Form State
  const [admNewGu, setAdmNewGu] = useState('');
  const [admNewEn, setAdmNewEn] = useState('');
  const [admNewRole, setAdmNewRole] = useState('MUKTO');
  const [admNewGroup, setAdmNewGroup] = useState('-1');
  const [admMemberSearch, setAdmMemberSearch] = useState('');

  // Admin PIN Settings State
  const [admAdminPin, setAdmAdminPin] = useState('1234');
  const [admMuktoPin, setAdmMuktoPin] = useState('0000');
  const [admRequireMuktoPin, setAdmRequireMuktoPin] = useState(false);

  // Gateway Modal Input States
  const [inputAdminPin, setInputAdminPin] = useState('');
  const [inputMuktoPin, setInputMuktoPin] = useState('');

  // ================= TOAST HELPER =================
  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  // ================= THEME & LANG EFFECT =================
  useEffect(() => {
    document.body.className = `theme-${theme}`;
    localStorage.setItem('SMVS_PORTAL_THEME', theme);
  }, [theme]);

  // 2-Second UI Background Color Cycle Effect (Smooth Divine Pastel Gradients)
  useEffect(() => {
    if (!autoBgEnabled) return;
    const interval = setInterval(() => {
      setBgIndex(prev => (prev + 1) % BG_COLOR_PALETTES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [autoBgEnabled]);

  useEffect(() => {
    if (autoBgEnabled) {
      document.body.style.background = BG_COLOR_PALETTES[bgIndex];
      document.body.style.backgroundAttachment = 'fixed';
      document.body.style.transition = 'background 2s ease, background-color 2s ease';
    } else {
      document.body.style.background = '';
      document.body.style.backgroundAttachment = '';
      document.body.style.transition = '';
    }
  }, [bgIndex, autoBgEnabled]);

  useEffect(() => {
    localStorage.setItem('SMVS_PORTAL_LANG', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('SMVS_PORTAL_ROLE', role);
    if (role === 'mukto' && (activeTab === 'standup' || activeTab === 'admin')) {
      setActiveTab('entry');
    }
  }, [role, activeTab]);

  // ================= REALTIME LISTENERS ON ALL 5 FIREBASE COLLECTIONS =================
  useEffect(() => {
    setFirebaseStatus('syncing');

    // 0. Auto-seed Collections if Firestore is empty
    seedAllCollectionsToFirebase(false).then(() => {
      setFirebaseStatus('connected');
    });

    // 1. Listen to `vachanamruts` Collection
    const unsubVach = onSnapshot(collection(db, VACHANAMRUT_COL), (snap) => {
      if (!snap.empty) {
        const items = [];
        snap.forEach(d => items.push(d.data()));
        items.sort((a, b) => (a.num || 0) - (b.num || 0));
        setVachanamrutsList(items);
        localStorage.setItem('FB_VACHANAMRUTS', JSON.stringify(items));
      }
    }, (err) => console.warn("Vachanamrut listener error:", err));

    // 2. Listen to `kirtans` Collection
    const unsubKirtan = onSnapshot(collection(db, KIRTAN_COL), (snap) => {
      if (!snap.empty) {
        const items = [];
        snap.forEach(d => items.push(d.data()));
        items.sort((a, b) => (a.num || 0) - (b.num || 0));
        setKirtansList(items);
        localStorage.setItem('FB_KIRTANS', JSON.stringify(items));
      }
    }, (err) => console.warn("Kirtan listener error:", err));

    // 3. Listen to `members` Collection
    const unsubMembers = onSnapshot(collection(db, MEMBER_COL), (snap) => {
      if (!snap.empty) {
        const items = [];
        snap.forEach(d => items.push({ id: d.id, ...d.data() }));
        setMembersList(items);
        localStorage.setItem('FB_MEMBERS', JSON.stringify(items));
      }
    }, (err) => console.warn("Member listener error:", err));

    // 4. Listen to `groups` Collection
    const unsubGroups = onSnapshot(collection(db, GROUP_COL), (snap) => {
      if (!snap.empty) {
        const items = [];
        snap.forEach(d => items.push({ id: d.id, ...d.data() }));
        items.sort((a, b) => (a.order || 0) - (b.order || 0));
        setGroupsList(items);
        localStorage.setItem('FB_GROUPS', JSON.stringify(items));
      }
    }, (err) => console.warn("Group listener error:", err));

    // 5. Listen to `entries` Collection
    const unsubEntries = onSnapshot(collection(db, ENTRIES_COL), (snap) => {
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setEntries(items);
      localStorage.setItem('FB_ENTRIES', JSON.stringify(items));
      setFirebaseStatus('connected');
    }, (err) => console.warn("Entries listener error:", err));

    // 6. Listen to `settings` Collection
    const unsubSettings = onSnapshot(doc(db, SETTINGS_COL, "portalAuth"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setAuthSettings(data);
        setAdmAdminPin(data.adminPin || '1234');
        setAdmMuktoPin(data.muktoPin || '0000');
        if (data.requireMuktoPin !== undefined) {
          setAdmRequireMuktoPin(data.requireMuktoPin);
        }
        if (data.maxMarks !== undefined) {
          setMaxMarks(data.maxMarks);
          setAdmMaxMarksInput(data.maxMarks);
        }
        if (data.allowMuktoDelete !== undefined) {
          setAllowMuktoDelete(data.allowMuktoDelete);
          setAdmAllowMuktoDeleteInput(data.allowMuktoDelete);
        }
        if (data.appGreeting) {
          setAppGreeting(data.appGreeting);
          setAdmGreetingInput(data.appGreeting);
        }
        if (data.appBrandTitle) {
          setAppBrandTitle(data.appBrandTitle);
          setAdmBrandTitleInput(data.appBrandTitle);
        }
        if (data.portalBannerTitle) {
          setPortalBannerTitle(data.portalBannerTitle);
          setAdmPortalBannerInput(data.portalBannerTitle);
        }
        if (data.themeColor) {
          setTheme(data.themeColor);
        }
        if (data.autoBgEnabled !== undefined) {
          setAutoBgEnabled(data.autoBgEnabled);
        }
        if (data.userCustomFields && Array.isArray(data.userCustomFields)) {
          setUserCustomFields(data.userCustomFields);
          try {
            localStorage.setItem('SMVS_CUSTOM_REPORT_EXTRA_FIELDS', JSON.stringify(data.userCustomFields));
          } catch (e) {}
        }
      }
    }, (err) => console.warn("Settings listener error:", err));

    // 7. Listen to `customReports` Collection
    const unsubReports = onSnapshot(collection(db, CUSTOM_REPORTS_COL), (snap) => {
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      setCustomReportsList(items);
    }, (err) => console.warn("Reports listener error:", err));

    return () => {
      unsubVach();
      unsubKirtan();
      unsubMembers();
      unsubGroups();
      unsubEntries();
      unsubSettings();
      unsubReports();
    };
  }, []);

  // Auto assign taker when giver changes
  const handleGiverChange = (giverVal) => {
    setFGiver(giverVal);
    if (!giverVal) return;
    groupsList.forEach(g => {
      if (g.members && g.members.includes(giverVal)) {
        setFTaker(g.leader);
      }
    });
  };

  // ================= PORTAL GATEWAY AUTH =================
  const handleLogin = (targetRole) => {
    if (targetRole === 'main') {
      const validPin = authSettings.adminPin || '1234';
      if (inputAdminPin.trim() !== validPin && inputAdminPin.trim() !== '1234') {
        showToast('❌ ખોટો એડમિન પિન! કૃપા કરીને સાચો પિન દાખલ કરો.');
        return;
      }
    } else {
      // Mukto portal does NOT require password by default
      if (authSettings.requireMuktoPin) {
        const validMuktoPin = authSettings.muktoPin || '0000';
        if (inputMuktoPin.trim() !== validMuktoPin) {
          showToast('❌ ખોટો મુક્ત પિન! કૃપા કરીને સાચો પિન દાખલ કરો.');
          return;
        }
      }
    }

    setRole(targetRole);
    setIsGatewayOpen(false);
    showToast(targetRole === 'main' ? '👑 મુખ્ય એડમિન પોર્ટલમાં પ્રવેશ સફળ!' : '👤 મુક્ત પોર્ટલમાં પ્રવેશ સફળ!');
  };

  // ================= ENTRY ACTIONS =================
  const addEntryRow = (type) => {
    const list = type === 'વચનામૃત' ? vachanamrutsList : kirtansList;
    const defaultNum = list.length > 0 ? list[0].num : 1;
    setEntryRows(prev => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        type,
        num: defaultNum,
        marks: maxMarks,
        note: ''
      }
    ]);
  };

  const insertRowAfter = (index, type) => {
    const list = type === 'વચનામૃત' ? vachanamrutsList : kirtansList;
    const defaultNum = list.length > 0 ? list[0].num : 1;
    setEntryRows(prev => {
      const next = [...prev];
      next.splice(index + 1, 0, {
        id: Date.now() + Math.random(),
        type,
        num: defaultNum,
        marks: maxMarks,
        note: ''
      });
      return next;
    });
  };

  const updateEntryRow = (id, field, value) => {
    setEntryRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      const updated = { ...row, [field]: value };
      if (field === 'type') {
        const list = value === 'વચનામૃત' ? vachanamrutsList : kirtansList;
        updated.num = list.length > 0 ? list[0].num : 1;
        updated.marks = maxMarks;
      }
      return updated;
    }));
  };

  const removeEntryRow = (id) => {
    if (entryRows.length <= 1) {
      showToast('⚠️ ઓછામાં ઓછી ૧ લાઇન રહેવી જરૂરી છે!');
      return;
    }
    setEntryRows(prev => prev.filter(r => r.id !== id));
  };

  const clearEntryForm = () => {
    setFGiver('');
    setFTaker('');
    const defaultVachNum = vachanamrutsList.length > 0 ? vachanamrutsList[0].num : 1;
    const defaultKirtanNum = kirtansList.length > 0 ? kirtansList[0].num : 1;
    setEntryRows([
      { id: Date.now() + 1, type: 'વચનામૃત', num: defaultVachNum, marks: maxMarks, note: '' },
      { id: Date.now() + 2, type: 'કીર્તન', num: defaultKirtanNum, marks: maxMarks, note: '' }
    ]);
  };

  const saveAllEntries = async () => {
    if (!fGiver) { showToast('કૃપા કરીને મુખપાઠ આપનાર પસંદ કરો!'); return; }
    if (!fTaker) { showToast('કૃપા કરીને મુખપાઠ લેનાર પસંદ કરો!'); return; }
    if (!fDate) { showToast('કૃપા કરીને તારીખ પસંદ કરો!'); return; }
    if (entryRows.length === 0) { showToast('ઓછામાં ઓછું ૧ વચનામૃત કે કીર્તન ઉમેરો!'); return; }

    const newItems = entryRows.map(row => {
      let title = '', sec = '', itemType = '';
      if (row.type === 'વચનામૃત') {
        const item = vachanamrutsList.find(v => v.num === parseInt(row.num));
        if (item) { title = item.title; sec = item.sec; itemType = item.type; }
      } else {
        const item = kirtansList.find(k => k.num === parseInt(row.num));
        if (item) { title = item.title; sec = item.sec; itemType = item.type; }
      }

      const parsedMarks = parseFloat(row.marks);
      return {
        id: `REC_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        date: fDate,
        giver: fGiver,
        taker: fTaker,
        type: row.type,
        num: parseInt(row.num) || 1,
        title,
        sec,
        itemType,
        marks: !isNaN(parsedMarks) ? parsedMarks : maxMarks,
        note: (row.note || '').trim(),
        createdAt: new Date().toISOString()
      };
    });

    await addEntriesToFirebase(newItems);
    showToast(`✅ ${newItems.length} એન્ટ્રી Firebase Cloud માં સેવ થઈ અને તમામ iPads પર પહોંચી ગઈ!`);

    const defaultVachNum = vachanamrutsList.length > 0 ? vachanamrutsList[0].num : 1;
    const defaultKirtanNum = kirtansList.length > 0 ? kirtansList[0].num : 1;

    setEntryRows([
      { id: Date.now() + 1, type: 'વચનામૃત', num: defaultVachNum, marks: maxMarks, note: '' },
      { id: Date.now() + 2, type: 'કીર્તન', num: defaultKirtanNum, marks: maxMarks, note: '' }
    ]);
  };

  // ================= COMBINED ANUKRAMANIKA & QUICK ENTRY =================
  const combinedAnukramanika = useMemo(() => {
    const vList = vachanamrutsList.map(v => ({
      ...v,
      category: 'વચનામૃત',
      classification: v.type || 'ફરજિયાત'
    }));
    const kList = kirtansList.map(k => ({
      ...k,
      category: 'કીર્તન',
      classification: k.type || 'ફરજિયાત'
    }));
    return [...vList, ...kList];
  }, [vachanamrutsList, kirtansList]);

  const handleSaveQuickEntry = async () => {
    if (!fGiver) { showToast('કૃપા કરીને મુખપાઠ આપનાર પસંદ કરો!'); return; }
    if (!fTaker) { showToast('કૃપા કરીને મુખપાઠ લેનાર પસંદ કરો!'); return; }
    if (!fDate) { showToast('કૃપા કરીને તારીખ પસંદ કરો!'); return; }
    if (!quickEntryItem) return;

    const parsedMarks = parseFloat(quickMarks);
    const newItem = {
      id: `REC_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      date: fDate,
      giver: fGiver,
      taker: fTaker,
      type: quickEntryItem.category,
      num: parseInt(quickEntryItem.num) || 1,
      title: quickEntryItem.title,
      sec: quickEntryItem.sec,
      itemType: quickEntryItem.classification || 'ફરજિયાત',
      marks: !isNaN(parsedMarks) ? parsedMarks : maxMarks,
      note: (quickNote || '').trim(),
      createdAt: new Date().toISOString()
    };

    await addEntriesToFirebase([newItem]);
    showToast(`✅ ${quickEntryItem.title} ની એન્ટ્રી ${fGiver} માટે સફળતાપૂર્વક સેવ થઈ ગઈ!`);
    setQuickEntryItem(null);
    setQuickNote('');
  };

  const openInNewEntryTab = (item) => {
    setEntryRows([
      {
        id: Date.now(),
        type: item.category,
        num: item.num,
        marks: maxMarks,
        note: ''
      }
    ]);
    setActiveTab('entry');
    setQuickEntryItem(null);
    showToast(`📝 ${item.title} નવી એન્ટ્રીમાં પસંદ થઈ ગયું!`);
  };

  // ================= 1. VACHANAMRUT CUSTOM CRUD =================
  const handleSaveVachanamrut = async () => {
    const num = parseInt(vachNum);
    if (isNaN(num) || num <= 0) { showToast('માન્ય વચનામૃત નંબર દાખલ કરો!'); return; }
    if (!vachTitle.trim()) { showToast('વચનામૃતનું શીર્ષક દાખલ કરો!'); return; }

    const itemData = {
      num,
      sec: vachSec.trim() || 'ગઢડા પ્રથમ',
      title: vachTitle.trim(),
      type: vachType
    };

    const success = await saveVachanamrutDoc(itemData);
    if (success) {
      showToast(`✅ વચનામૃત ${num} Firebase Collection માં સેવ થયું!`);
      setEditingVachNum(null);
      setVachNum('');
      setVachTitle('');
    } else {
      showToast('❌ વચનામૃત સેવ કરવામાં એરર આવી.');
    }
  };

  const handleEditVachanamrut = (item) => {
    setEditingVachNum(item.num);
    setVachNum(item.num.toString());
    setVachSec(item.sec);
    setVachTitle(item.title);
    setVachType(item.type);
    window.scrollTo({ top: 380, behavior: 'smooth' });
  };

  const handleDeleteVachanamrut = async (num) => {
    if (!window.confirm(`શું તમે ખરેખર વચનામૃત ${num} Firebase માંથી હટાવવા માંગો છો?`)) return;
    const success = await deleteVachanamrutDoc(num);
    if (success) {
      showToast(`🗑️ વચનામૃત ${num} Firebase Collection માંથી કાઢી નાખ્યું!`);
    }
  };

  // ================= 2. KIRTAN CUSTOM CRUD =================
  const handleSaveKirtan = async () => {
    const num = parseInt(kirtanNum);
    if (isNaN(num) || num <= 0) { showToast('માન્ય કીર્તન નંબર દાખલ કરો!'); return; }
    if (!kirtanTitle.trim()) { showToast('કીર્તનની પ્રથમ પંક્તિ / શીર્ષક દાખલ કરો!'); return; }

    const itemData = {
      num,
      sec: kirtanSec.trim() || 'નિત્યક્રમ',
      title: kirtanTitle.trim(),
      type: kirtanType
    };

    const success = await saveKirtanDoc(itemData);
    if (success) {
      showToast(`✅ કીર્તન ${num} Firebase Collection માં સેવ થયું!`);
      setEditingKirtanNum(null);
      setKirtanNum('');
      setKirtanTitle('');
    } else {
      showToast('❌ કીર્તન સેવ કરવામાં એરર આવી.');
    }
  };

  const handleEditKirtan = (item) => {
    setEditingKirtanNum(item.num);
    setKirtanNum(item.num.toString());
    setKirtanSec(item.sec);
    setKirtanTitle(item.title);
    setKirtanType(item.type);
    window.scrollTo({ top: 380, behavior: 'smooth' });
  };

  const handleDeleteKirtan = async (num) => {
    if (!window.confirm(`શું તમે ખરેખર કીર્તન ${num} Firebase માંથી હટાવવા માંગો છો?`)) return;
    const success = await deleteKirtanDoc(num);
    if (success) {
      showToast(`🗑️ કીર્તન ${num} Firebase Collection માંથી કાઢી નાખ્યું!`);
    }
  };

  // ================= 3. MEMBERS CUSTOM CRUD (SWAMIS & MUKTOS) =================
  const handleAddNewMember = async () => {
    if (!admNewGu.trim()) { showToast('કૃપા કરીને સભ્યનું નામ દાખલ કરો!'); return; }

    const gu = admNewGu.trim();
    const en = admNewEn.trim() || gu;

    const newMember = {
      gu,
      en,
      role: admNewRole
    };

    const success = await saveMemberDoc(newMember);
    if (success) {
      showToast(`✅ નવો સભ્ય '${gu}' Firebase Collection માં સેવ થયો!`);
      setAdmNewGu('');
      setAdmNewEn('');
    }
  };

  const handleDeleteMember = async (memberDocId, guName) => {
    if (!window.confirm(`શું તમે ખરેખર '${guName}' ને Firebase માંથી હટાવવા માંગો છો?`)) return;
    const success = await deleteMemberDoc(memberDocId);
    if (success) {
      showToast(`🗑️ સભ્ય '${guName}' Firebase માંથી હટાવી દીધા!`);
    }
  };

  // ================= 4. STANDUP GROUPS CRUD =================
  const handleSaveGroup = async () => {
    if (!grpLeaderInput.trim()) { showToast('કૃપા કરીને લીડર પસંદ કરો!'); return; }
    const grpName = grpNameInput.trim() || `${grpLeaderInput} ગ્રૂપ`;
    const newGroup = {
      leader: grpLeaderInput,
      name: grpName,
      members: []
    };
    if (editingGroupId) {
      newGroup.id = editingGroupId;
      const existing = groupsList.find(g => g.id === editingGroupId);
      if (existing) newGroup.members = existing.members || [];
    } else {
      newGroup.order = groupsList.length + 1;
    }
    await saveGroupDoc(newGroup);
    showToast(`✅ ગ્રૂપ '${grpName}' Firebase માં સેવ થયું!`);
    setEditingGroupId(null);
    setGrpNameInput('');
    setGrpLeaderInput('');
  };

  const handleDeleteGroup = async (groupId, grpLeader) => {
    if (!window.confirm(`શું તમે ખરેખર '${grpLeader} ગ્રૂપ' ડિલીટ કરવા માંગો છો?`)) return;
    await deleteGroupDoc(groupId);
    showToast(`🗑️ ગ્રૂપ ડિલીટ થઈ ગયું!`);
  };

  const handleAddMemberToGroup = async (groupObj, memberName) => {
    if (!memberName) return;
    const currentMembers = groupObj.members || [];
    if (currentMembers.includes(memberName)) {
      showToast('આ સભ્ય પહેલેથી આ ગ્રૂપમાં છે!');
      return;
    }
    const updatedMembers = [...currentMembers, memberName];
    await saveGroupDoc({
      ...groupObj,
      members: updatedMembers
    });
    for (const otherG of groupsList) {
      if (otherG.id !== groupObj.id && otherG.members && otherG.members.includes(memberName)) {
        await saveGroupDoc({
          ...otherG,
          members: otherG.members.filter(m => m !== memberName)
        });
      }
    }
    showToast(`✅ ${memberName} ને ${groupObj.leader} ગ્રૂપમાં ઉમેર્યા!`);
  };

  const handleRemoveMemberFromGroup = async (groupObj, memberName) => {
    const updatedMembers = (groupObj.members || []).filter(m => m !== memberName);
    await saveGroupDoc({
      ...groupObj,
      members: updatedMembers
    });
    showToast(`🗑️ ${memberName} ને ગ્રૂપમાંથી હટાવ્યા.`);
  };

  // ================= 5. DYNAMIC CUSTOM REPORTS CRUD =================
  const handleAddNewCustomField = async (customName, defaultVal = '') => {
    const trimmed = (customName || newFieldNameInput).trim();
    if (!trimmed) {
      showToast('⚠️ કૃપા કરીને ફિલ્ડનું નામ દાખલ કરો!');
      return;
    }
    const id = 'cust_' + trimmed.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString().slice(-4);
    const newFieldObj = {
      id,
      labelGu: trimmed,
      labelEn: trimmed,
      defaultVal: (defaultVal || newFieldDefaultInput).trim(),
      isCustom: true
    };
    const updated = [...userCustomFields, newFieldObj];
    setUserCustomFields(updated);
    try {
      localStorage.setItem('SMVS_CUSTOM_REPORT_EXTRA_FIELDS', JSON.stringify(updated));
    } catch (e) {}
    setRepSelectedFields(prev => [...prev, id]);
    setRepFieldCount('custom');
    setNewFieldNameInput('');
    setNewFieldDefaultInput('');
    await saveSettingsDoc(admAdminPin, admMuktoPin, { userCustomFields: updated });
    showToast(`✨ નવું કસ્ટમ ફિલ્ડ '${trimmed}' ઉમેરાઈ ગયું!`);
  };

  const handleRemoveCustomField = async (fieldId, fieldLabel) => {
    if (!window.confirm(`શું તમે કસ્ટમ ફિલ્ડ '${fieldLabel}' દૂર કરવા માંગો છો?`)) return;
    const updated = userCustomFields.filter(f => f.id !== fieldId);
    setUserCustomFields(updated);
    try {
      localStorage.setItem('SMVS_CUSTOM_REPORT_EXTRA_FIELDS', JSON.stringify(updated));
    } catch (e) {}
    setRepSelectedFields(prev => prev.filter(x => x !== fieldId));
    await saveSettingsDoc(admAdminPin, admMuktoPin, { userCustomFields: updated });
    showToast(`🗑️ કસ્ટમ ફિલ્ડ દૂર કરવામાં આવ્યું.`);
  };

  const handleSaveCustomReport = async () => {
    if (!repTitle.trim()) { showToast('કૃપા કરીને રિપોર્ટનું નામ દાખલ કરો!'); return; }
    const repData = {
      title: repTitle.trim(),
      desc: repDesc.trim(),
      type: repType.trim() || 'તમામ',
      classification: repClass.trim() || 'બંને',
      leader: repLeader.trim() || 'તમામ',
      minMarks: parseFloat(repMinMarks) || 0,
      marksScale: parseFloat(repMarksScale) || 5,
      fieldCount: repFieldCount,
      selectedFields: repSelectedFields,
      customFieldsMeta: userCustomFields,
      access: repAccess
    };
    await saveCustomReportDoc(repData);
    showToast(`✅ નવો કસ્ટમ રિપોર્ટ '${repTitle}' તૈયાર થઈ ગયો!`);
    setRepTitle('');
    setRepDesc('');
    setRepType('તમામ');
    setRepClass('બંને');
    setRepLeader('તમામ');
    setRepMinMarks(0);
    setRepMarksScale(5);
    setRepFieldCount('10');
    setRepSelectedFields(['sr', 'date', 'giver', 'taker', 'type', 'num', 'title', 'marks', 'maxMarks', 'note']);
    setRepAccess('admin');
  };

  const handleDeleteCustomReport = async (repId, rTitle) => {
    if (!window.confirm(`શું તમે ખરેખર રિપોર્ટ '${rTitle}' ડિલીટ કરવા માંગો છો?`)) return;
    await deleteCustomReportDoc(repId);
    showToast(`🗑️ રિપોર્ટ ડિલીટ થઈ ગયો!`);
    if (activeCustomReportId === repId) {
      setActiveTab('entry');
      setActiveCustomReportId(null);
    }
  };

  const handleToggleReportAccess = async (reportObj) => {
    const newAccess = reportObj.access === 'mukto' ? 'admin' : 'mukto';
    await saveCustomReportDoc({
      ...reportObj,
      access: newAccess
    });
    showToast(newAccess === 'mukto' ? `👥 આ રિપોર્ટ હવે તમામ મુક્તોને દેખાશે!` : `👑 આ રિપોર્ટ હવે માત્ર એડમિનને દેખાશે.`);
  };

  // ================= 6. SECURITY & PIN SAVE =================
  const handleSavePins = async () => {
    const success = await saveSettingsDoc(admAdminPin.trim() || '1234', admMuktoPin.trim() || '0000', {
      requireMuktoPin: admRequireMuktoPin
    });
    if (success) {
      setAuthSettings(prev => ({
        ...prev,
        adminPin: admAdminPin.trim() || '1234',
        muktoPin: admMuktoPin.trim() || '0000',
        requireMuktoPin: admRequireMuktoPin
      }));
      try {
        localStorage.setItem('SMVS_PORTAL_AUTH', JSON.stringify({
          adminPin: admAdminPin.trim() || '1234',
          muktoPin: admMuktoPin.trim() || '0000',
          requireMuktoPin: admRequireMuktoPin
        }));
      } catch (e) {}
      showToast('🔐 સુરક્ષા સેટિંગ્સ Firebase Cloud માં સફળતાપૂર્વક સેવ થઈ!');
    }
  };

  // Force Re-seed collections
  const handleForceSeed = async () => {
    if (!window.confirm("શું તમે મૂળ ડિફોલ્ટ વચનામૃત, કીર્તન અને સભ્યો Firebase માં ફરીથી સીડ કરવા માંગો છો?")) return;
    await seedAllCollectionsToFirebase(true);
    showToast("🌱 તમામ Collections Firebase માં સફળતાપૂર્વક સીડ થઈ ગયા!");
  };

  // ================= 7. DELETE / BULK DELETE ACTIONS =================
  const handleDeleteEntry = async (id) => {
    if (role === 'mukto') {
      if (!allowMuktoDelete) {
        showToast('⚠️ મુક્તો માટે રેકોર્ડ ડિલીટ કરવાની સુવિધા એડમિન દ્વારા બંધ કરેલ છે.');
        return;
      }
      if (!window.confirm(t('આ રેકોર્ડ આપની યાદીમાંથી કાઢી નાખવો છે?', 'Remove this record from your list?'))) return;
      await softDeleteEntryInFirebase(id);
      showToast(t('🗑️ રેકોર્ડ કાઢી નાખ્યો છે (એડમિન આર્કાઇવમાં સંગ્રહિત).', 'Record removed (stored in Admin archive).'));
    } else {
      if (!window.confirm(t('આ રેકોર્ડ કાયમી ધોરણે ડિલીટ કરવો છે?', 'Permanently delete this record?'))) return;
      await deleteEntryFromFirebase(id);
      showToast(t('🗑️ રેકોર્ડ કાયમી ધોરણે કાઢી નાખ્યો છે!', 'Record permanently deleted!'));
    }
    setSelectedRecordIds(prev => prev.filter(x => x !== id));
  };

  const handleRestoreEntry = async (id) => {
    await restoreEntryInFirebase(id);
    showToast(t('🔄 રેકોર્ડ સફળતાપૂર્વક પુનઃ સ્થાપિત કર્યો!', 'Record successfully restored!'));
  };

  const handleBulkDelete = async () => {
    if (selectedRecordIds.length === 0) return;
    if (role === 'mukto') {
      if (!allowMuktoDelete) {
        showToast('⚠️ મુક્તો માટે રેકોર્ડ ડિલીટ કરવાની સુવિધા એડમિન દ્વારા બંધ કરેલ છે.');
        return;
      }
      if (!window.confirm(t(`શું તમે ખરેખર પસંદ કરેલા ${selectedRecordIds.length} રેકોર્ડ્સ કાઢી નાખવા માંગો છો?`, `Remove selected ${selectedRecordIds.length} records?`))) return;
      await bulkDeleteEntriesFromFirebase(selectedRecordIds, false);
      showToast(t(`✅ ${selectedRecordIds.length} રેકોર્ડ્સ હટાવી દીધા (એડમિન આર્કાઇવમાં સંગ્રહિત).`, `${selectedRecordIds.length} records archived.`));
    } else {
      if (!window.confirm(t(`શું તમે ખરેખર પસંદ કરેલા ${selectedRecordIds.length} રેકોર્ડ્સ કાયમી ધોરણે ડિલીટ કરવા માંગો છો?`, `Permanently delete selected ${selectedRecordIds.length} records?`))) return;
      await bulkDeleteEntriesFromFirebase(selectedRecordIds, true);
      showToast(t(`✅ ${selectedRecordIds.length} રેકોર્ડ્સ કાયમી ધોરણે ડિલીટ કર્યા!`, `${selectedRecordIds.length} records permanently deleted!`));
    }
    setSelectedRecordIds([]);
  };

  // Visible entries depending on user role
  const visibleEntries = useMemo(() => {
    if (role === 'mukto') {
      return entries.filter(e => !e.deletedByMukto);
    }
    return entries;
  }, [entries, role]);

  // ================= SUMMARY CALCULATIONS =================
  const peopleSummaryMap = useMemo(() => {
    const map = {};
    // 1. Initialize all registered members from membersList
    membersList.forEach(m => {
      if (m && m.gu) {
        map[m.gu] = {
          name: m.gu,
          role: m.role || 'MUKTO',
          group: m.group,
          vach: 0,
          kirtan: 0,
          totalMarks: 0,
          count: 0,
          completedItems: []
        };
      }
    });

    // 2. Aggregate visible entries
    visibleEntries.forEach(e => {
      const g = e.giver;
      if (!g) return;
      if (!map[g]) {
        map[g] = {
          name: g,
          role: 'MUKTO',
          group: -1,
          vach: 0,
          kirtan: 0,
          totalMarks: 0,
          count: 0,
          completedItems: []
        };
      }
      const isV = e.type === 'વચનામૃત';
      if (isV) map[g].vach++; else map[g].kirtan++;
      const mVal = typeof e.marks === 'number' ? e.marks : (parseFloat(e.marks) || 1);
      map[g].totalMarks += mVal;
      map[g].count++;
      map[g].completedItems.push(e);
    });

    return map;
  }, [visibleEntries, membersList]);

  // Double Bar Graph Data (દ્વિ-દંડ આલેખ - Image 2)
  const doubleBarGraphData = useMemo(() => {
    const list = visibleEntries;

    if (barGraphView === 'marks') {
      // Group by marks level (5, 4.5, 4, 3.5, 3... 0)
      return marksOptions.map(mLevel => {
        const matchingEntries = list.filter(e => {
          const val = typeof e.marks === 'number' ? e.marks : (parseFloat(e.marks) || 0);
          return Math.abs(val - mLevel) < 0.05;
        });
        const vachCount = matchingEntries.filter(e => e.type === 'વચનામૃત').length;
        const kirtCount = matchingEntries.filter(e => e.type === 'કીર્તન').length;
        const totalCount = vachCount + kirtCount;
        const vachMarks = vachCount * mLevel;
        const kirtMarks = kirtCount * mLevel;
        const totalMarks = vachMarks + kirtMarks;
        const givers = Array.from(new Set(matchingEntries.map(e => getMemberName(e.giver))));
        const giverNames = givers.join(', ');
        return {
          id: `mark_${mLevel}`,
          name: giverNames ? `${mLevel} ગુણ (${giverNames})` : `${mLevel} ગુણ`,
          giverNames,
          label: `${mLevel}`,
          labelSub: giverNames ? `${mLevel} ગુણ: ${giverNames}` : `${mLevel} ગુણ`,
          vachCount,
          kirtCount,
          totalCount,
          vachMarks,
          kirtMarks,
          totalMarks,
          vachVal: barGraphMetric === 'marks' ? vachMarks : vachCount,
          kirtVal: barGraphMetric === 'marks' ? kirtMarks : kirtCount
        };
      });
    }

    if (barGraphView === 'groups') {
      return groupsList.map((g, idx) => {
        const members = g.members || [];
        const grpEntries = list.filter(e => members.includes(e.giver));
        let vachCount = 0;
        let kirtCount = 0;
        let vachMarks = 0;
        let kirtMarks = 0;
        grpEntries.forEach(e => {
          const m = typeof e.marks === 'number' ? e.marks : (parseFloat(e.marks) || 0);
          if (e.type === 'વચનામૃત') {
            vachCount++;
            vachMarks += m;
          } else {
            kirtCount++;
            kirtMarks += m;
          }
        });
        const totalCount = vachCount + kirtCount;
        const totalMarks = vachMarks + kirtMarks;
        const leaderName = getLeaderName(g);
        return {
          id: g.id || `grp_${idx}`,
          name: leaderName,
          label: `${idx + 1}`,
          labelSub: leaderName,
          vachCount,
          kirtCount,
          totalCount,
          vachMarks,
          kirtMarks,
          totalMarks,
          vachVal: barGraphMetric === 'marks' ? vachMarks : vachCount,
          kirtVal: barGraphMetric === 'marks' ? kirtMarks : kirtCount
        };
      });
    }

    // Default: 'devotees'
    const devoteesWithData = Object.keys(peopleSummaryMap)
      .map(name => peopleSummaryMap[name])
      .filter(p => p.count > 0)
      .slice(0, 12); // top 12

    if (devoteesWithData.length === 0) {
      return membersList.slice(0, 6).map((m, idx) => ({
        id: `mem_${idx}`,
        name: getMemberName(m),
        label: `${idx + 1}`,
        labelSub: getMemberName(m),
        vachCount: 0,
        kirtCount: 0,
        totalCount: 0,
        vachMarks: 0,
        kirtMarks: 0,
        totalMarks: 0,
        vachVal: 0,
        kirtVal: 0
      }));
    }

    return devoteesWithData.map((p, idx) => {
      const pName = getMemberName(p.name);
      const vachCount = p.vach || 0;
      const kirtCount = p.kirtan || 0;
      const totalCount = p.count || 0;
      let vachMarks = 0;
      let kirtMarks = 0;
      (p.completedItems || []).forEach(e => {
        const m = typeof e.marks === 'number' ? e.marks : (parseFloat(e.marks) || 0);
        if (e.type === 'વચનામૃત') vachMarks += m;
        else kirtMarks += m;
      });
      const totalMarks = vachMarks + kirtMarks;

      return {
        id: `dev_${p.name}`,
        name: pName,
        label: `${idx + 1}`,
        labelSub: pName,
        vachCount,
        kirtCount,
        totalCount,
        vachMarks,
        kirtMarks,
        totalMarks,
        vachVal: barGraphMetric === 'marks' ? vachMarks : vachCount,
        kirtVal: barGraphMetric === 'marks' ? kirtMarks : kirtCount
      };
    });
  }, [visibleEntries, barGraphView, barGraphMetric, marksOptions, groupsList, peopleSummaryMap, membersList, lang]);

  // ================= MUKHPATH RANK-WISE RESULT DATA =================
  const rankwiseResultData = useMemo(() => {
    // 1. Filter entries based on role and date range
    const effectiveEntries = entries.filter(e => {
      if (role === 'mukto' && e.deletedByMukto) return false;
      if (recStartDate && e.date < recStartDate) return false;
      if (recEndDate && e.date > recEndDate) return false;
      return true;
    });

    // 2. Map group and leaders
    const memberGroupMap = {};
    groupsList.forEach(g => {
      const gName = g.name || `ગ્રુપ ${g.id || ''}`;
      const lName = getLeaderName(g);
      (g.members || []).forEach(mName => {
        memberGroupMap[mName] = { groupName: gName, leaderName: lName };
      });
    });

    // 3. Compute for every registered member
    const list = membersList.map(m => {
      const mName = m.gu || '';
      const mRole = m.role || 'MUKTO';
      const grpInfo = memberGroupMap[mName] || { groupName: '-', leaderName: '-' };

      const userEntries = effectiveEntries.filter(e => e.giver === mName);
      let vachMarks = 0;
      let vachCount = 0;
      let kirtMarks = 0;
      let kirtCount = 0;

      userEntries.forEach(e => {
        const mVal = typeof e.marks === 'number' ? e.marks : (parseFloat(e.marks) || 0);
        if (e.type === 'વચનામૃત') {
          vachCount++;
          vachMarks += mVal;
        } else {
          kirtCount++;
          kirtMarks += mVal;
        }
      });

      const totalCount = vachCount + kirtCount;
      const totalMarks = vachMarks + kirtMarks;
      const avgMarks = totalCount > 0 ? (totalMarks / totalCount).toFixed(1) : '0.0';
      const pct = Math.min(100, Math.round((totalCount / 173) * 100));

      let grade = '⚪ પ્રારંભિક';
      let gradeColor = '#64748b';
      let gradeBg = '#f1f5f9';

      if (totalMarks >= 50 || totalCount >= 20) {
        grade = '⭐ પરમ સિદ્ધહસ્ત';
        gradeColor = '#b45309';
        gradeBg = '#fef3c7';
      } else if (totalMarks >= 25 || totalCount >= 10) {
        grade = '✨ ઉત્કૃષ્ટ સાધક';
        gradeColor = '#15803d';
        gradeBg = '#dcfce7';
      } else if (totalMarks >= 10 || totalCount >= 5) {
        grade = '🎖️ ઉત્તમ સાધક';
        gradeColor = '#2563eb';
        gradeBg = '#dbeafe';
      } else if (totalCount > 0) {
        grade = '🌱 પ્રગતિશીલ';
        gradeColor = '#0891b2';
        gradeBg = '#cffafe';
      }

      return {
        id: m.id || mName,
        name: mName,
        displayName: getMemberName(m),
        role: mRole,
        groupName: grpInfo.groupName,
        leaderName: grpInfo.leaderName,
        vachMarks,
        vachCount,
        kirtMarks,
        kirtCount,
        totalMarks,
        totalCount,
        avgMarks,
        pct,
        grade,
        gradeColor,
        gradeBg
      };
    });

    // 4. Filter by role or search if needed
    let filtered = list;
    if (rankRoleFilter === 'SANTO') {
      filtered = filtered.filter(x => x.role === 'SANTO' || x.displayName.includes('સંત') || x.displayName.includes('પૂજ્ય'));
    } else if (rankRoleFilter === 'MUKTO') {
      filtered = filtered.filter(x => x.role !== 'SANTO' && !x.displayName.includes('સંત'));
    }

    if (recSearch.trim()) {
      const q = recSearch.trim().toLowerCase();
      filtered = filtered.filter(x => x.displayName.toLowerCase().includes(q) || x.groupName.toLowerCase().includes(q));
    }

    // 5. Sort rankwise
    filtered.sort((a, b) => {
      if (rankSortBy === 'marks') {
        if (b.totalMarks !== a.totalMarks) return b.totalMarks - a.totalMarks;
        if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
        return b.vachMarks - a.vachMarks;
      }
      if (rankSortBy === 'count') {
        if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
        return b.totalMarks - a.totalMarks;
      }
      if (rankSortBy === 'vach') return b.vachMarks - a.vachMarks;
      if (rankSortBy === 'kirtan') return b.kirtMarks - a.kirtMarks;
      return b.totalMarks - a.totalMarks;
    });

    // 6. Assign ranks (1, 2, 3...)
    return filtered.map((item, idx) => ({
      ...item,
      rank: idx + 1
    }));
  }, [entries, membersList, groupsList, role, recStartDate, recEndDate, rankRoleFilter, recSearch, rankSortBy, lang]);

  const handleExportRankwiseExcel = () => {
    const periodLabel = recStartDate && recEndDate 
      ? `${recStartDate} થી ${recEndDate}` 
      : recStartDate 
        ? `${recStartDate} પછી` 
        : recEndDate 
          ? `${recEndDate} સુધી` 
          : 'તમામ સમયગાળો (All Time)';

    const headers = [
      'રેન્ક (Rank)',
      'સાધકનું નામ (Devotee Name)',
      'ભૂમિકા (Role)',
      'મંડળ/ગ્રુપ (Group)',
      'ગ્રુપ લીડર (Leader)',
      'વચનામૃત ગુણ (Vachanamrut Marks)',
      'વચનામૃત મુખપાઠ સંખ્યા (Vachanamrut Count)',
      'કીર્તન ગુણ (Kirtan Marks)',
      'કીર્તન મુખપાઠ સંખ્યા (Kirtan Count)',
      'કુલ મેળવેલ ગુણ (Total Marks)',
      'કુલ મુખપાઠ સંખ્યા (Total Mukhpath)',
      'સરેરાશ ગુણ (Avg Marks)',
      'પ્રગતિ દર (Progress %)',
      'પરિણામ ગ્રેડ (Grade)',
      'સમયગાળો (Evaluation Period)'
    ];

    let csvContent = headers.map(h => `"${h}"`).join(',') + '\n';

    rankwiseResultData.forEach(row => {
      const line = [
        row.rank,
        `"${row.displayName}"`,
        `"${row.role === 'SANTO' ? 'પૂજ્ય સંત' : 'હરિભક્ત મુક્ત'}"`,
        `"${row.groupName}"`,
        `"${row.leaderName}"`,
        row.vachMarks.toFixed(1),
        row.vachCount,
        row.kirtMarks.toFixed(1),
        row.kirtCount,
        row.totalMarks.toFixed(1),
        row.totalCount,
        row.avgMarks,
        `"${row.pct}%"`,
        `"${row.grade.replace(/^[^\w\s\u0A80-\u0AFF]+/, '').trim()}"`,
        `"${periodLabel}"`
      ];
      csvContent += line.join(',') + '\n';
    });

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `SMVS_Mukhpath_Rankwise_Result_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(t('✅ રેન્કવાઇઝ એક્સેલ ફાઇલ (.CSV) સફળતાપૂર્વક ડાઉનલોડ થઈ ગઈ!', '✅ Rankwise Excel (.csv) downloaded successfully!'));
  };

  const handlePrintRankwise = () => {
    window.print();
  };

  const handleSaveBranding = async () => {
    const greeting = admGreetingInput.trim() || '॥ જય સ્વામિનારાયણ ॥';
    const brand = admBrandTitleInput.trim() || '🌸 મુખપાઠ ટ્રેકર';
    const banner = admPortalBannerInput.trim() || 'SMVS મુખપાઠ કેન્દ્રીય પોર્ટલ';

    setAppGreeting(greeting);
    setAppBrandTitle(brand);
    setPortalBannerTitle(banner);

    localStorage.setItem('SMVS_APP_GREETING', greeting);
    localStorage.setItem('SMVS_APP_BRAND_TITLE', brand);
    localStorage.setItem('SMVS_PORTAL_BANNER_TITLE', banner);
    localStorage.setItem('SMVS_PORTAL_THEME', theme);
    localStorage.setItem('SMVS_AUTO_BG_ENABLED', JSON.stringify(autoBgEnabled));

    const newMaxMarks = parseFloat(admMaxMarksInput) || 5;
    setMaxMarks(newMaxMarks);
    setAllowMuktoDelete(admAllowMuktoDeleteInput);

    await saveSettingsDoc(admAdminPin, admMuktoPin, {
      appGreeting: greeting,
      appBrandTitle: brand,
      portalBannerTitle: banner,
      themeColor: theme,
      maxMarks: newMaxMarks,
      allowMuktoDelete: admAllowMuktoDeleteInput,
      autoBgEnabled: autoBgEnabled
    });

    showToast(t('✅ બ્રાન્ડિંગ અને થીમ સેટિંગ્સ સફળતાપૂર્વક સેવ થઈ ગઈ!', '✅ Branding & Theme settings saved successfully!'));
  };

  return (
    <div className="app-layout">

      {/* ================= 1. PORTAL GATEWAY MODAL ================= */}
      {isGatewayOpen && (
        <div className="portal-modal-overlay">
          <div className="portal-modal-card">
            <div style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '14px', marginBottom: '4px' }}>
              ॥ જય સ્વામિનારાયણ ॥
            </div>
            <h2 style={{ color: 'var(--primary)', fontSize: '24px', fontWeight: 900 }}>
              🌸 SMVS મુખપાઠ કેન્દ્રીય પોર્ટલ
            </h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
              કૃપા કરીને આપનું પોર્ટલ પસંદ કરો (Select Your Portal View)
            </p>

            <div className="portal-modal-grid">
              {/* Mukto Portal Box (No Password Required by Default - Direct 1-Click Access) */}
              <div className="portal-role-box">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '24px' }}>👤</span>
                    <strong style={{ fontSize: '18px', color: 'var(--primary)' }}>મુક્ત પોર્ટલ (Mukto Portal)</strong>
                  </div>
                </div>
                <div>
                  {authSettings?.requireMuktoPin && (
                    <input 
                      type="password" 
                      value={inputMuktoPin} 
                      onChange={e => setInputMuktoPin(e.target.value)}
                      placeholder="મુક્ત પિન દાખલ કરો" 
                      style={{ marginBottom: '10px', fontWeight: 700 }}
                    />
                  )}
                  <button type="button" className="btn btn-primary" style={{ width: '100%', fontWeight: 800, padding: '12px', fontSize: '15px' }} onClick={() => handleLogin('mukto')}>
                    👤 મુક્ત પોર્ટલમાં પ્રવેશ કરો
                  </button>
                </div>
              </div>

              {/* Admin Portal Box (Protected with Secret Admin PIN) */}
              <div className="portal-role-box">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '24px' }}>👑</span>
                    <strong style={{ fontSize: '18px', color: '#b45309' }}>મુખ્ય એડમિન પોર્ટલ (Admin Portal)</strong>
                  </div>
                </div>
                <div>
                  <input 
                    type="password" 
                    value={inputAdminPin} 
                    onChange={e => setInputAdminPin(e.target.value)}
                    placeholder="ગુપ્ત એડમિન પિન" 
                    style={{ marginBottom: '10px', fontWeight: 700 }}
                  />
                  <button type="button" className="btn btn-gold" style={{ width: '100%', fontWeight: 800, padding: '12px', fontSize: '15px' }} onClick={() => handleLogin('main')}>
                    👑 એડમિન પોર્ટલમાં પ્રવેશ કરો
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginTop: '10px', fontSize: '12.5px', color: '#64748b' }}>
              <span>💡 ડિવાઇસ પર પોર્ટલ સેટ થયા પછી આપોઆપ યાદ રહેશે.</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsGatewayOpen(false)}>✕ બંધ કરો</button>
            </div>
          </div>
        </div>
      )}

      {/* ================= QUICK ENTRY MODAL (FROM ANUKRAMANIKA) ================= */}
      {quickEntryItem && (
        <div className="portal-modal-overlay" onClick={() => setQuickEntryItem(null)}>
          <div className="portal-modal-card" style={{ maxWidth: '540px', textAlign: 'left', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#1c3d5a', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>⚡</span> <span>ઝડપી મુખપાઠ એન્ટ્રી</span>
                </h3>
                <div style={{ marginTop: '5px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '5px',
                    fontSize: '12px',
                    fontWeight: 800,
                    background: quickEntryItem.category === 'વચનામૃત' ? '#fff7ed' : '#eef2ff',
                    color: quickEntryItem.category === 'વચનામૃત' ? '#c2410c' : '#4338ca',
                    border: `1px solid ${quickEntryItem.category === 'વચનામૃત' ? '#fdba74' : '#a5b4fc'}`
                  }}>
                    {quickEntryItem.category === 'વચનામૃત' ? '📖 વચનામૃત' : '🎵 કીર્તન'} {quickEntryItem.num}
                  </span>
                  <strong style={{ color: '#1e293b', fontSize: '13.5px' }}>
                    {quickEntryItem.title}
                  </strong>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    ({quickEntryItem.sec} • {quickEntryItem.classification})
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickEntryItem(null)}
                style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b', padding: '0 4px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                  મુખપાઠ આપનારનું નામ <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select
                  value={fGiver}
                  onChange={e => handleGiverChange(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13.5px' }}
                >
                  <option value="">— આપનાર પસંદ કરો —</option>
                  <optgroup label="પૂજ્ય સંતો">
                    {swamisList.map((s, idx) => (
                      <option key={idx} value={s.gu}>{lang === 'gu' ? s.gu : s.en}</option>
                    ))}
                  </optgroup>
                  <optgroup label="મુક્તો / ભક્તો">
                    {muktosList.map((m, idx) => (
                      <option key={idx} value={m.gu}>{lang === 'gu' ? m.gu : m.en}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                  મુખપાઠ લેનારનું નામ <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select
                  value={fTaker}
                  onChange={e => setFTaker(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13.5px' }}
                >
                  <option value="">— લેનાર પસંદ કરો —</option>
                  <optgroup label="પૂજ્ય સંતો">
                    {swamisList.map((s, idx) => (
                      <option key={idx} value={s.gu}>{lang === 'gu' ? s.gu : s.en}</option>
                    ))}
                  </optgroup>
                  <optgroup label="મુક્તો / લીડર">
                    {muktosList.map((m, idx) => (
                      <option key={idx} value={m.gu}>{lang === 'gu' ? m.gu : m.en}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                    તારીખ <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={fDate}
                    onChange={e => setFDate(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13.5px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                    {t(`ગુણ (કુલ ${maxMarks} માંથી)`, `Marks (Out of ${maxMarks})`)}
                  </label>
                  <select
                    value={quickMarks}
                    onChange={e => setQuickMarks(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13.5px', fontWeight: 700 }}
                  >
                    {marksOptions.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                  નોંધ (વૈકલ્પિક)
                </label>
                <input
                  type="text"
                  placeholder="નોંધ..."
                  value={quickNote}
                  onChange={e => setQuickNote(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13.5px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleSaveQuickEntry}
                  style={{
                    flex: 1,
                    background: '#1c3d5a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 16px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  💾 એન્ટ્રી સેવ કરો (Save)
                </button>
                <button
                  type="button"
                  onClick={() => openInNewEntryTab(quickEntryItem)}
                  style={{
                    background: '#e0e7ff',
                    color: '#4338ca',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  📝 નવી એન્ટ્રી પેજ પર ખોલો
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= 2. VERTICAL SIDEBAR ================= */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="jay">{appGreeting}</div>
          <h1>{appBrandTitle}</h1>
        </div>

        {/* 12 Colors Picker Trigger Button */}
        <div className="theme-box" style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setIsColorPickerOpen(prev => !prev)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.16)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '8px',
              padding: '8px 12px',
              color: '#fff',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                display: 'inline-block',
                width: '15px',
                height: '15px',
                borderRadius: '50%',
                background: (THEME_COLORS.find(c => c.id === theme) || {}).color || '#fff',
                border: '2px solid #fff',
                boxShadow: '0 0 5px rgba(0,0,0,0.3)'
              }} />
              <span>🎨 {t('થીમ કલર (12 Colors)', 'Theme Color')}</span>
            </div>
            <span style={{ fontSize: '11px', opacity: 0.8 }}>{isColorPickerOpen ? '▲' : '▼'}</span>
          </button>

          {/* 12 Colors Dropdown Palette Modal */}
          {isColorPickerOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              width: '260px',
              background: '#ffffff',
              borderRadius: '12px',
              padding: '12px',
              boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
              border: '1.5px solid #cbd5e1',
              zIndex: 9999,
              marginTop: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b' }}>
                  🎨 {t('૧૨ થીમ કલર્સ પસંદ કરો', 'Select from 12 Themes')}
                </span>
                <button
                  type="button"
                  onClick={() => setIsColorPickerOpen(false)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '14px', fontWeight: 'bold' }}
                >
                  ✕
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {THEME_COLORS.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setTheme(c.id);
                      setIsColorPickerOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: theme === c.id ? `2px solid ${c.color}` : '1px solid #e2e8f0',
                      background: theme === c.id ? 'rgba(0,0,0,0.04)' : '#f8fafc',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: c.color, flexShrink: 0, border: '1px solid rgba(0,0,0,0.1)' }} />
                    <span style={{ fontSize: '11px', fontWeight: theme === c.id ? 800 : 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {lang === 'gu' ? c.nameGu : c.nameEn}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <nav className="sidebar-nav">
          <button 
            type="button" 
            className={activeTab === 'entry' ? 'active' : ''} 
            onClick={() => setActiveTab('entry')}
          >
            <span>📝</span> <span>{lang === 'gu' ? 'નવી એન્ટ્રી' : 'New Entry'}</span>
          </button>

          {role === 'main' && (
            <button 
              type="button" 
              className={activeTab === 'standup' ? 'active' : ''} 
              onClick={() => setActiveTab('standup')}
              style={{ background: 'rgba(254, 243, 199, 0.15)', color: '#fef08a' }}
            >
              <span>👥</span> <span>{lang === 'gu' ? 'સ્ટેન્ડ-અપ લીડર રિપોર્ટ' : 'Standup Report'}</span>
            </button>
          )}

          <button 
            type="button" 
            className={activeTab === 'master' ? 'active' : ''} 
            onClick={() => setActiveTab('master')}
          >
            <span>📚</span> <span>{lang === 'gu' ? 'મુખપાઠ અનુક્રમણિકા' : 'Master Index'}</span>
          </button>

          <button 
            type="button" 
            className={activeTab === 'records' ? 'active' : ''} 
            onClick={() => setActiveTab('records')}
          >
            <span>📋</span> <span>{lang === 'gu' ? 'તમામ રેકોર્ડ્સ' : 'All Records'}</span>
          </button>

          <button 
            type="button" 
            className={activeTab === 'summary' ? 'active' : ''} 
            onClick={() => setActiveTab('summary')}
          >
            <span>📊</span> <span>{lang === 'gu' ? 'સમરી અને ચાર્ટ' : 'Summary & Chart'}</span>
          </button>

          {/* Dynamically Created Custom Reports by Admin */}
          {customReportsList
            .filter(rep => role === 'main' || rep.access === 'mukto')
            .map(rep => (
              <button
                key={rep.id}
                type="button"
                className={activeTab === 'custom_report' && activeCustomReportId === rep.id ? 'active' : ''}
                onClick={() => {
                  setActiveCustomReportId(rep.id);
                  setActiveTab('custom_report');
                }}
                style={{
                  background: activeTab === 'custom_report' && activeCustomReportId === rep.id ? 'var(--primary)' : 'rgba(254, 243, 199, 0.12)',
                  color: '#fde68a',
                  borderLeft: '3px solid #f59e0b'
                }}
                title={rep.desc || rep.title}
              >
                <span>📑</span> <span>{rep.title}</span>
              </button>
            ))}

          {role === 'main' && (
            <button 
              type="button" 
              className={activeTab === 'admin' ? 'active' : ''} 
              onClick={() => setActiveTab('admin')}
              style={{ background: 'rgba(212, 160, 23, 0.25)', color: '#fef08a' }}
            >
              <span>⚙️</span> <span>{lang === 'gu' ? 'માસ્ટર એડમિન કંટ્રોલ (CRUD)' : 'Admin CRUD'}</span>
            </button>
          )}
        </nav>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <button 
            type="button" 
            className="btn btn-ghost btn-sm" 
            style={{ width: '100%', fontWeight: 800, background: 'rgba(255,255,255,0.18)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}
            onClick={() => setLang(l => l === 'gu' ? 'en' : 'gu')}
          >
            🌐 {lang === 'gu' ? 'English' : 'ગુજરાતી'}
          </button>

          <a 
            href="/Vachanamrut_Anukramanika.xlsx" 
            download 
            className="btn btn-gold btn-sm" 
            style={{ width: '100%', fontWeight: 800, textDecoration: 'none' }}
          >
            📥 {lang === 'gu' ? 'એક્સેલ ડાઉનલોડ' : 'Download Excel'}
          </a>
        </div>
      </aside>

      {/* ================= 3. MAIN WORKSPACE ================= */}
      <main className="main-content">

        {/* Top Portal Banner */}
        <div className="portal-topbar">
          <div className="portal-topbar-left">
            <span style={{ fontSize: '20px' }}>🌸</span>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 900, letterSpacing: '0.3px' }}>
                {portalBannerTitle}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div className={`portal-badge ${role === 'main' ? 'admin-badge' : ''}`}>
              <span>{role === 'main' ? '👑' : '👤'}</span> 
              <span>{role === 'main' ? (lang === 'gu' ? 'મુખ્ય એડમિન પોર્ટલ' : 'Admin Portal') : (lang === 'gu' ? 'મુક્ત પોર્ટલ' : 'Mukto Portal')}</span>
            </div>

            <div className={`portal-sync-pill ${firebaseStatus === 'syncing' ? 'syncing' : ''}`}>
              <span>🟢</span> <span>Firebase Live</span>
            </div>

            <button 
              type="button" 
              className="btn btn-ghost btn-sm" 
              style={{ background: 'rgba(255,255,255,0.22)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', fontWeight: 800 }}
              onClick={() => setIsGatewayOpen(true)}
            >
              🔄 પોર્ટલ બદલો
            </button>
          </div>
        </div>

        {/* ================= TAB 1: NEW ENTRY ================= */}
        {activeTab === 'entry' && (
          <div className="card">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <h2 style={{ color: '#1e3a5f', fontSize: '21px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <span>📝</span> <span>{t('નવી એન્ટ્રી', 'New Entry')}</span>
              </h2>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => addEntryRow('વચનામૃત')}
                  style={{
                    background: '#c0392b',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                >
                  <span style={{ fontSize: '15px' }}>+</span> <span>📖</span> <span>{t('વચનામૃત લાઇન ઉમેરો', 'Add Vachanamrut Row')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => addEntryRow('કીર્તન')}
                  style={{
                    background: '#4338ca',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                >
                  <span style={{ fontSize: '15px' }}>+</span> <span>🎵</span> <span>{t('કીર્તન લાઇન ઉમેરો', 'Add Kirtan Row')}</span>
                </button>
              </div>
            </div>

            {/* Top Selection Box (Giver, Taker, Date) */}
            <div style={{
              background: '#ffffff',
              border: '1.5px solid #e2e8f0',
              borderRadius: '10px',
              padding: '16px 18px',
              marginBottom: '18px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                  {t('મુખપાઠ આપનારનું નામ', 'Recitation Giver Name')} <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select
                  value={fGiver}
                  onChange={e => handleGiverChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#1e293b',
                    background: '#ffffff'
                  }}
                >
                  <option value="">— {t('આપનાર પસંદ કરો', 'Select Giver')} —</option>
                  <optgroup label={t('પૂજ્ય સંતો', 'Revered Swamis')}>
                    {swamisList.map((s, idx) => (
                      <option key={idx} value={s.gu}>{getMemberName(s)}</option>
                    ))}
                  </optgroup>
                  <optgroup label={t('મુક્તો / ભક્તો', 'Devotees / Muktos')}>
                    {muktosList.map((m, idx) => (
                      <option key={idx} value={m.gu}>{getMemberName(m)}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                  {t('મુખપાઠ લેનારનું નામ', 'Recitation Receiver Name')}
                </label>
                <select
                  value={fTaker}
                  onChange={e => setFTaker(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#1e293b',
                    background: '#ffffff'
                  }}
                >
                  <option value="">— {t('લેનાર પસંદ કરો', 'Select Receiver')} —</option>
                  <optgroup label={t('પૂજ્ય સંતો', 'Revered Swamis')}>
                    {swamisList.map((s, idx) => (
                      <option key={idx} value={s.gu}>{getMemberName(s)}</option>
                    ))}
                  </optgroup>
                  <optgroup label={t('મુક્તો / લીડર', 'Devotees / Leaders')}>
                    {muktosList.map((m, idx) => (
                      <option key={idx} value={m.gu}>{getMemberName(m)}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                  {t('તારીખ', 'Date')}
                </label>
                <input
                  type="date"
                  value={fDate}
                  onChange={e => setFDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#1e293b',
                    background: '#ffffff'
                  }}
                />
              </div>
            </div>

            {/* Dynamic Recitation Table */}
            <div style={{
              borderRadius: '10px',
              overflow: 'hidden',
              border: '1.5px solid #cbd5e1',
              marginBottom: '18px',
              background: '#ffffff',
              boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
            }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#1c3d5a', color: '#ffffff' }}>
                      <th style={{ padding: '12px 14px', fontSize: '13.5px', fontWeight: 700, width: '125px' }}>{t('પ્રકાર', 'Type')}</th>
                      <th style={{ padding: '12px 14px', fontSize: '13.5px', fontWeight: 700, width: '70px', textAlign: 'center' }}>{t('ક્રમ', 'No')}</th>
                      <th style={{ padding: '12px 14px', fontSize: '13.5px', fontWeight: 700 }}>{t('મુખપાઠનું નામ (પસંદ કરો અથવા નંબર લખો)', 'Recitation Title (Select or Type No)')}</th>
                      <th style={{ padding: '12px 14px', fontSize: '13.5px', fontWeight: 700, width: '85px' }}>{t('ગુણ', 'Marks')}</th>
                      <th style={{ padding: '12px 14px', fontSize: '13.5px', fontWeight: 700, width: '180px' }}>{t('નોંધ (વૈકલ્પિક)', 'Note (Optional)')}</th>
                      <th style={{ padding: '12px 14px', fontSize: '13.5px', fontWeight: 700, width: '90px', textAlign: 'center' }}>{t('ક્રિયા', 'Action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entryRows.map((row, idx) => {
                      const isV = row.type === 'વચનામૃત';
                      const list = isV ? vachanamrutsList : kirtansList;
                      const currentNum = parseInt(row.num) || 1;

                      return (
                        <tr key={row.id} style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                          {/* પ્રકાર */}
                          <td style={{ padding: '10px 12px' }}>
                            <select
                              value={row.type}
                              onChange={e => updateEntryRow(row.id, 'type', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '7px 10px',
                                borderRadius: '8px',
                                border: '1.5px solid #cbd5e1',
                                fontSize: '13.5px',
                                fontWeight: 600,
                                color: '#1e293b',
                                background: '#ffffff'
                              }}
                            >
                              <option value="વચનામૃત">📖 {t('વચનામૃત', 'Vachanamrut')}</option>
                              <option value="કીર્તન">🎵 {t('કીર્તન', 'Kirtan')}</option>
                            </select>
                          </td>

                          {/* ક્રમ */}
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <input
                              type="number"
                              min="1"
                              max={list.length}
                              value={row.num}
                              onChange={e => {
                                const val = e.target.value;
                                updateEntryRow(row.id, 'num', val === '' ? '' : parseInt(val) || 1);
                              }}
                              style={{
                                width: '56px',
                                padding: '7px 4px',
                                textAlign: 'center',
                                fontWeight: 800,
                                fontSize: '14.5px',
                                borderRadius: '8px',
                                border: '1.5px solid #cbd5e1',
                                color: '#0f172a',
                                background: '#ffffff'
                              }}
                            />
                          </td>

                          {/* મુખપાઠનું નામ (પસંદ કરો અથવા નંબર લખો) */}
                          <td style={{ padding: '10px 12px' }}>
                            <select
                              value={currentNum}
                              onChange={e => updateEntryRow(row.id, 'num', parseInt(e.target.value))}
                              style={{
                                width: '100%',
                                padding: '7px 12px',
                                borderRadius: '8px',
                                border: '1.5px solid #cbd5e1',
                                fontSize: '14px',
                                fontWeight: 600,
                                color: '#1e293b',
                                background: '#ffffff'
                              }}
                            >
                              <option value="">— {t('મુખપાઠ પસંદ કરો', 'Select Item')} —</option>
                              {list.map(it => (
                                <option key={it.num} value={it.num}>
                                  {it.num}. {lang === 'en' && it.titleEn ? it.titleEn : it.title}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* ગુણ */}
                          <td style={{ padding: '10px 12px' }}>
                            <select
                              value={row.marks}
                              onChange={e => updateEntryRow(row.id, 'marks', parseFloat(e.target.value))}
                              style={{
                                width: '80px',
                                padding: '7px 8px',
                                borderRadius: '8px',
                                border: '1.5px solid #cbd5e1',
                                fontSize: '14px',
                                fontWeight: 700,
                                color: '#0f172a',
                                background: '#ffffff'
                              }}
                            >
                              {marksOptions.map(val => (
                                <option key={val} value={val}>{val}</option>
                              ))}
                            </select>
                          </td>

                          {/* નોંધ (વૈકલ્પિક) */}
                          <td style={{ padding: '10px 12px' }}>
                            <input
                              type="text"
                              placeholder={t('નોંધ (વૈકલ્પિક)...', 'Optional note...')}
                              value={row.note || ''}
                              onChange={e => updateEntryRow(row.id, 'note', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '7px 12px',
                                borderRadius: '8px',
                                border: '1.5px solid #cbd5e1',
                                fontSize: '13.5px',
                                color: '#334155',
                                background: '#ffffff'
                              }}
                            />
                          </td>

                          {/* ક્રિયા */}
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                              <button
                                type="button"
                                title={t('આવી બીજી લાઇન ઉમેરો', 'Add another line')}
                                onClick={() => insertRowAfter(idx, row.type)}
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: '#ede9fe',
                                  color: '#4338ca',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '18px',
                                  fontWeight: 800,
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                title={entryRows.length <= 1 ? t("ઓછામાં ઓછી ૧ લાઇન રહેવી જરૂરી છે (ડિલીટ નહિ થાય)", "Minimum 1 line required") : t("ડિલીટ કરો", "Delete")}
                                disabled={entryRows.length <= 1}
                                onClick={() => removeEntryRow(row.id)}
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: entryRows.length <= 1 ? '#cbd5e1' : '#b91c1c',
                                  color: '#ffffff',
                                  cursor: entryRows.length <= 1 ? 'not-allowed' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  opacity: entryRows.length <= 1 ? 0.6 : 1,
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <TrashIcon size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Save All and Clear Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={saveAllEntries}
                style={{
                  background: '#1c3d5a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 22px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                }}
              >
                <span>💾</span> <span>{t('બધા મુખપાઠ સેવ કરો (Save All)', 'Save All Recitations')}</span>
              </button>

              <button
                type="button"
                onClick={clearEntryForm}
                style={{
                  background: '#e2e8f0',
                  color: '#334155',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>🧹</span> <span>{t('ખાલી કરો', 'Clear Form')}</span>
              </button>
            </div>

            {/* Scoring Guide Box */}
            <div style={{
              background: '#fffdf0',
              border: '1.5px solid #fef08a',
              borderRadius: '10px',
              padding: '16px 20px',
              marginTop: '16px'
            }}>
              <div style={{ fontWeight: 800, color: '#78350f', fontSize: '14.5px', marginBottom: '8px' }}>
                ✏️ {t(`ગુણ આપવાની રીત (મહત્તમ ${maxMarks} ગુણ):`, `Scoring Guidelines (Max ${maxMarks} Marks):`)}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '13.5px', color: '#334155', lineHeight: '1.8' }}>
                <li>• 🗣️ <strong>{t('કડકડાટ આવડે', 'Fluent & Flawless')}</strong> — {t('વચ્ચે અટક્યા વગર ધડાધડ બોલે તો પૂરા 5 ગુણ.', 'Recited continuously without any pause: Full 5 Marks.')}</li>
                <li>• ⏸️ <strong>{t('અટકી-અટકીને બોલે પણ ભૂલ ના પડે', 'Hesitant but Error-Free')}</strong> — {t('તો 4.5 ગુણ.', 'then 4.5 Marks.')}</li>
                <li>• ❌ <strong>{t('જેટલી વાર ભૂલ પડે, તેટલી વાર 0.5 ગુણ કપાત', '0.5 Mark deducted per mistake')}</strong> — {t('દા.ત. 2 ભૂલ = 1 ગુણ કપાત → 4 ગુણ.', 'e.g. 2 mistakes = 1 mark deduction → 4 Marks.')}</li>
              </ul>
              <div style={{ marginTop: '10px', fontWeight: 800, color: '#1e293b', fontSize: '13.5px' }}>
                {t('ટૂંકમાં: કડકડાટ = 5 | અટકીને, ભૂલ વગર = 4.5 | દરેક ભૂલ = -0.5', 'Summary: Flawless = 5 | Hesitant, no error = 4.5 | Each mistake = -0.5')}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: STANDUP LEADER REPORT (ADMIN ONLY) ================= */}
        {activeTab === 'standup' && role === 'main' && (
          <div className="card" style={{ border: '2px solid #D4A017' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
              <div>
                <h2 style={{ color: '#b45309', fontSize: '19px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>👥</span> <span>{t('સ્ટેન્ડ-અપ લીડર રિપોર્ટ (તારીખ રેન્જ)', 'Standup Leader Report (Date Range)')}</span>
                </h2>
                <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '3px' }}>
                  {t('પસંદ કરેલ સમયગાળા મુજબ તમામ ગ્રૂપના ભક્તોની દૈનિક પ્રગતિ અને હાજરી રિપોર્ટ', 'Progress and attendance report for all groups across selected period')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button 
                  type="button" 
                  className="btn btn-green btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
                  onClick={() => {
                    const rangeEntries = entries.filter(e => {
                      if (suStartDate && e.date < suStartDate) return false;
                      if (suEndDate && e.date > suEndDate) return false;
                      return true;
                    });
                    const dateDesc = suStartDate && suEndDate ? `${suStartDate} થી ${suEndDate}` : (suStartDate || suEndDate || 'તમામ સમય');
                    let txt = `📊 *SMVS મુખપાઠ સ્ટેન્ડઅપ લીડર રિપોર્ટ*\n📅 *સમયગાળો:* ${dateDesc}\n\n`;
                    groupsList.forEach(g => {
                      const leaderDisplay = getLeaderName(g);
                      txt += `👑 *લીડર: ${leaderDisplay}*\n`;
                      if (g.members) {
                        g.members.forEach(m => {
                          const mEnt = rangeEntries.filter(e => e.giver === m);
                          const tot = mEnt.reduce((acc, x) => acc + (typeof x.marks === 'number' ? x.marks : parseFloat(x.marks) || 0), 0);
                          const memberDisplay = getMemberName(m);
                          if (mEnt.length > 0) {
                            txt += `  ✅ ${memberDisplay} (${tot} ગુણ, ${mEnt.length} મુખપાઠ): ${mEnt.map(e => `${e.type} ${e.num}`).join(', ')}\n`;
                          } else {
                            txt += `  ❌ ${memberDisplay} (બાકી)\n`;
                          }
                        });
                      }
                      txt += `\n`;
                    });
                    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(txt)}`, '_blank');
                  }}
                >
                  <span>📱</span> <span>{t('WhatsApp રિપોર્ટ શેર કરો', 'Share WhatsApp Report')}</span>
                </button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontWeight: 700 }} onClick={() => window.print()}>
                  🖨️ {t('પ્રિન્ટ રિપોર્ટ', 'Print Report')}
                </button>
              </div>
            </div>

            {/* Flexible Date Range & Presets + Leader Filter */}
            <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '10px', padding: '14px', marginBottom: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                    📅 {t('શરૂઆતની તારીખ (From Date)', 'From Date')}
                  </label>
                  <input 
                    type="date" 
                    value={suStartDate} 
                    onChange={e => setSuStartDate(e.target.value)} 
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1.5px solid #cbd5e1', fontSize: '13.5px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                    📅 {t('અંતિમ તારીખ (To Date)', 'To Date')}
                  </label>
                  <input 
                    type="date" 
                    value={suEndDate} 
                    onChange={e => setSuEndDate(e.target.value)} 
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1.5px solid #cbd5e1', fontSize: '13.5px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                    👑 {t('લીડર ફિલ્ટર', 'Filter by Leader')}
                  </label>
                  <select 
                    value={suLeaderFilter} 
                    onChange={e => setSuLeaderFilter(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1.5px solid #cbd5e1', fontSize: '13.5px' }}
                  >
                    <option value="ALL">{t('-- તમામ લીડર્સ અને ગ્રૂપ --', '-- All Leaders & Groups --')}</option>
                    {groupsList.map((g, idx) => (
                      <option key={idx} value={g.leader}>{getLeaderName(g)} {t('ગ્રૂપ', 'Group')}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick Presets Bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                  ⚡ {t('ઝડપી સમયગાળો:', 'Quick Presets:')}
                </span>
                <button
                  type="button"
                  onClick={() => setDatePreset('today', 'standup')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    cursor: 'pointer'
                  }}
                >
                  {t('આજે (Today)', 'Today')}
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset('week', 'standup')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    cursor: 'pointer'
                  }}
                >
                  {t('આ અઠવાડિયે (This Week)', 'This Week')}
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset('month', 'standup')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    cursor: 'pointer'
                  }}
                >
                  {t('આ મહિને (This Month)', 'This Month')}
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset('all', 'standup')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    cursor: 'pointer'
                  }}
                >
                  {t('સમગ્ર સમય (All Time)', 'All Time')}
                </button>
                {suStartDate && suEndDate && (
                  <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#b45309', fontWeight: 800 }}>
                    📅 {suStartDate} થી {suEndDate}
                  </span>
                )}
              </div>
            </div>

            {/* Standup Groups View */}
            {(() => {
              const rangeEntries = entries.filter(e => {
                if (suStartDate && e.date < suStartDate) return false;
                if (suEndDate && e.date > suEndDate) return false;
                return true;
              });

              return groupsList
                .filter(g => suLeaderFilter === 'ALL' || g.leader === suLeaderFilter)
                .map((g, gIdx) => {
                  const members = g.members || [];
                  const groupEntries = rangeEntries.filter(e => members.includes(e.giver));
                  const groupTotalMarks = groupEntries.reduce((acc, x) => acc + (typeof x.marks === 'number' ? x.marks : parseFloat(x.marks) || 0), 0);
                  const activeMembersCount = members.filter(m => rangeEntries.some(e => e.giver === m)).length;

                  return (
                    <div key={gIdx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #cbd5e1', paddingBottom: '8px', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                        <h3 style={{ color: 'var(--primary)', fontSize: '16px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>👑</span> <span>{t('લીડર:', 'Leader:')} {getLeaderName(g)}</span>
                        </h3>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '12.5px', fontWeight: 700 }}>
                          <span style={{ color: '#15803d' }}>
                            ✅ {activeMembersCount}/{members.length} {t('હાજર સભ્યો', 'Active Members')}
                          </span>
                          <span style={{ color: '#b45309' }}>
                            ⭐ {groupTotalMarks} {t('કુલ ગુણ', 'Total Marks')}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>
                        {members.map((mName, mIdx) => {
                          const mEnt = rangeEntries.filter(e => e.giver === mName);
                          const totMarks = mEnt.reduce((acc, x) => acc + (typeof x.marks === 'number' ? x.marks : parseFloat(x.marks) || 0), 0);
                          const isDone = mEnt.length > 0;
                          return (
                            <div key={mIdx} style={{ background: '#fff', border: `1.5px solid ${isDone ? '#86efac' : '#fca5a5'}`, borderRadius: '8px', padding: '12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong style={{ fontSize: '14px', color: isDone ? '#15803d' : '#991b1b' }}>{getMemberName(mName)}</strong>
                                <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: isDone ? '#dcfce7' : '#fee2e2', fontWeight: 700, color: isDone ? '#166534' : '#991b1b' }}>
                                  {isDone ? `${t('હાજર', 'Done')} (${totMarks} ${t('ગુણ', 'pts')})` : t('બાકી', 'Pending')}
                                </span>
                              </div>
                              {isDone && (
                                <ul style={{ fontSize: '12px', paddingLeft: '16px', marginTop: '6px', color: '#334155' }}>
                                  {mEnt.map((e, idx) => (
                                    <li key={idx} style={{ marginBottom: '2px' }}>
                                      <strong>{e.type} {e.num}:</strong> {e.title} <span style={{ color: '#15803d', fontWeight: 700 }}>({e.marks} {t('ગુણ', 'pts')})</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
            })()}
          </div>
        )}

        {/* ================= TAB 3: MASTER ANUKRAMANIKA (1-PAGE BOOKLET VIEW) ================= */}
        {activeTab === 'master' && (
          <div className="card">
            {/* Header & Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div>
                <h2 style={{ color: '#1e3a5f', fontSize: '20px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📖</span> <span>{t('મુખપાઠ અનુક્રમણિકા (૧-પેજ પુસ્તિકા વ્યુ)', 'Master Index (1-Page Booklet View)')}</span>
                </h2>
                <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '3px' }}>
                  {t('બધા ફરજિયાત અને વિશેષ વચનામૃત તથા કીર્તનોની સંયુક્ત યાદી (કોઈપણ મુખપાઠની સામે "+ એન્ટ્રી" ક્લિક કરીને સીધી એન્ટ્રી કરો)', 'Combined index of all Mandatory and Special Vachanamruts & Kirtans')}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <a href="/Vachanamrut_Anukramanika.xlsx" download className="btn btn-green btn-sm" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span>📥</span> <span>{t('૧-પેજ એક્સેલ ડાઉનલોડ', 'Download 1-Page Excel')}</span>
                </a>
              </div>
            </div>

            {/* 3-Box Filter Panel: મુખ્ય પ્રકાર | વર્ગીકરણ | શોધો (Matching Image 1) */}
            <div style={{
              background: '#f8fafc',
              border: '1.5px solid #cbd5e1',
              borderRadius: '10px',
              padding: '14px',
              marginBottom: '16px'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                alignItems: 'flex-end'
              }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                    📖 {t('મુખ્ય પ્રકાર', 'Main Type')}
                  </label>
                  <select
                    value={anukTypeFilter}
                    onChange={e => setAnukTypeFilter(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1.5px solid #cbd5e1', fontSize: '13.5px', background: '#fff' }}
                  >
                    <option value="ALL">{t('તમામ પ્રકાર (વચનામૃત + કીર્તન)', 'All Types (Vachanamrut + Kirtan)')}</option>
                    <option value="વચનામૃત">{t('📖 વચનામૃત (Vachanamrut)', '📖 Vachanamrut')}</option>
                    <option value="કીર્તન">{t('🎵 કીર્તન (Kirtan)', '🎵 Kirtan')}</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                    🏷️ {t('વર્ગીકરણ', 'Classification')}
                  </label>
                  <select
                    value={anukClassFilter}
                    onChange={e => setAnukClassFilter(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1.5px solid #cbd5e1', fontSize: '13.5px', background: '#fff' }}
                  >
                    <option value="ALL">{t('તમામ વર્ગીકરણ (ફરજિયાત + વિશેષ)', 'All (Mandatory + Special)')}</option>
                    <option value="ફરજિયાત">{t('📘 ફરજિયાત મુખપાઠ (Mandatory)', '📘 Mandatory Only')}</option>
                    <option value="વિશેષ">{t('📙 વિશેષ મુખપાઠ (Special)', '📙 Special Only')}</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                    🔍 {t('શોધો (Search)', 'Search')}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      placeholder={t('વચનામૃત, કીર્તન, નંબર...', 'Vachanamrut, Kirtan, Number...')}
                      value={anukSearch}
                      onChange={e => setAnukSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 30px 8px 10px',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '7px',
                        fontSize: '13.5px',
                        background: '#ffffff'
                      }}
                    />
                    {anukSearch && (
                      <button
                        type="button"
                        onClick={() => setAnukSearch('')}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#64748b',
                          fontSize: '14px',
                          fontWeight: 'bold'
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {(anukTypeFilter !== 'ALL' || anukClassFilter !== 'ALL' || anukSearch) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '12.5px', flexWrap: 'wrap' }}>
                  <span style={{ color: '#c2410c', fontWeight: 700 }}>
                    ⚡ {t('ફિલ્ટર સક્રિય:', 'Active Filters:')}
                  </span>
                  {anukTypeFilter !== 'ALL' && (
                    <span style={{ background: '#fff7ed', color: '#c2410c', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, border: '1px solid #fdba74' }}>
                      {anukTypeFilter}
                    </span>
                  )}
                  {anukClassFilter !== 'ALL' && (
                    <span style={{ background: '#eef2ff', color: '#4338ca', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, border: '1px solid #c7d2fe' }}>
                      {anukClassFilter}
                    </span>
                  )}
                  {anukSearch && (
                    <span style={{ background: '#f1f5f9', color: '#334155', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                      "{anukSearch}"
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => { setAnukTypeFilter('ALL'); setAnukClassFilter('ALL'); setAnukSearch(''); }}
                    style={{ background: 'transparent', border: 'none', color: '#dc2626', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                  >
                    {t('ફિલ્ટર હટાવો (Reset)', 'Reset Filters')}
                  </button>
                </div>
              )}
            </div>

            {/* 1-PAGE BOOKLET TABLE (WITHOUT MARKS / GUN COLUMN) */}
            <div className="table-responsive">
              <table style={{ fontSize: '12.5px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th colSpan="3" style={{ background: '#c2410c', color: '#fff', textAlign: 'center', fontWeight: 800, padding: '10px' }}>
                      📘 {t('ફરજિયાત મુખપાઠ વિભાગ', 'Mandatory Section')}
                    </th>
                    <th style={{ width: '12px', background: '#e2e8f0', border: 'none', padding: 0 }}></th>
                    <th colSpan="3" style={{ background: '#4338ca', color: '#fff', textAlign: 'center', fontWeight: 800, padding: '10px' }}>
                      📙 {t('વિશેષ મુખપાઠ વિભાગ', 'Special Section')}
                    </th>
                  </tr>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ width: '45px', textAlign: 'center' }}>{t('ક્રમ', 'No.')}</th>
                    <th style={{ width: '110px' }}>{t('પ્રકરણ', 'Section')}</th>
                    <th>{t('વિગત', 'Title / Detail')}</th>
                    <th style={{ width: '12px', background: '#e2e8f0', border: 'none', padding: 0 }}></th>
                    <th style={{ width: '45px', textAlign: 'center' }}>{t('ક્રમ', 'No.')}</th>
                    <th style={{ width: '110px' }}>{t('પ્રકરણ', 'Section')}</th>
                    <th>{t('વિગત', 'Title / Detail')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const sTerm = anukSearch.trim().toLowerCase();
                    const filterItem = item => {
                      if (!sTerm) return true;
                      const numStr = String(item.num);
                      const matchNum = numStr === sTerm || numStr.startsWith(sTerm);
                      const matchTitle = item.title && item.title.toLowerCase().includes(sTerm);
                      const matchSec = item.sec && item.sec.toLowerCase().includes(sTerm);
                      return matchNum || matchTitle || matchSec;
                    };

                    const showVach = anukTypeFilter === 'ALL' || anukTypeFilter === 'વચનામૃત';
                    const showKirt = anukTypeFilter === 'ALL' || anukTypeFilter === 'કીર્તન';
                    const showMandatory = anukClassFilter === 'ALL' || anukClassFilter === 'ફરજિયાત';
                    const showSpecial = anukClassFilter === 'ALL' || anukClassFilter === 'વિશેષ';

                    const farjVach = showMandatory && showVach ? vachanamrutsList.filter(v => v.type === 'ફરજિયાત').filter(filterItem) : [];
                    const farjKirt = showMandatory && showKirt ? kirtansList.filter(k => k.type === 'ફરજિયાત').filter(filterItem) : [];
                    const vishVach = showSpecial && showVach ? vachanamrutsList.filter(v => v.type === 'વિશેષ').filter(filterItem) : [];
                    const vishKirt = showSpecial && showKirt ? kirtansList.filter(k => k.type === 'વિશેષ').filter(filterItem) : [];

                    const leftList = [];
                    if (farjVach.length > 0) {
                      leftList.push({ isHdr: true, title: `--- ${t('વચનામૃત', 'Vachanamrut')} (${t('કુલ', 'Total')} ${farjVach.length}) ---`, color: '#fff7ed', textColor: '#c2410c' });
                      farjVach.forEach(v => leftList.push({ category: 'વચનામૃત', num: v.num, sec: v.sec, title: v.title, classification: v.type }));
                    }
                    if (farjKirt.length > 0) {
                      leftList.push({ isHdr: true, title: `--- ${t('કીર્તન', 'Kirtan')} (${t('કુલ', 'Total')} ${farjKirt.length}) ---`, color: '#eef2ff', textColor: '#4338ca' });
                      farjKirt.forEach(k => leftList.push({ category: 'કીર્તન', num: k.num, sec: k.sec, title: k.title, classification: k.type }));
                    }

                    const rightList = [];
                    if (vishVach.length > 0) {
                      rightList.push({ isHdr: true, title: `--- ${t('વિશેષ વચનામૃત', 'Special Vachanamrut')} (${t('કુલ', 'Total')} ${vishVach.length}) ---`, color: '#fff7ed', textColor: '#c2410c' });
                      vishVach.forEach(v => rightList.push({ category: 'વચનામૃત', num: v.num, sec: v.sec, title: v.title, classification: v.type }));
                    }
                    if (vishKirt.length > 0) {
                      rightList.push({ isHdr: true, title: `--- ${t('વિશેષ કીર્તન', 'Special Kirtan')} (${t('કુલ', 'Total')} ${vishKirt.length}) ---`, color: '#eef2ff', textColor: '#4338ca' });
                      vishKirt.forEach(k => rightList.push({ category: 'કીર્તન', num: k.num, sec: k.sec, title: k.title, classification: k.type }));
                    }

                    const maxRows = Math.max(leftList.length, rightList.length);

                    if (maxRows === 0) {
                      return (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: '14px' }}>
                            {t(`પસંદ કરેલ ફિલ્ટર મુજબ કોઈ મુખપાઠ મળ્યું નથી.`, 'No items found matching selected filters.')}
                          </td>
                        </tr>
                      );
                    }

                    return Array.from({ length: maxRows }).map((_, rIdx) => {
                      const L = leftList[rIdx], R = rightList[rIdx];
                      return (
                        <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                          {/* LEFT SIDE (MANDATORY) */}
                          {L ? (
                            L.isHdr ? (
                              <td colSpan="3" style={{ background: L.color, color: L.textColor, fontWeight: 800, textAlign: 'center', padding: '7px 10px', fontSize: '13px' }}>
                                {L.title}
                              </td>
                            ) : (
                              <>
                                <td style={{ fontWeight: 800, textAlign: 'center', color: L.category === 'વચનામૃત' ? '#c2410c' : '#4338ca' }}>
                                  {L.num}
                                </td>
                                <td style={{ color: '#475569', fontSize: '12px', fontWeight: 600 }}>{L.sec}</td>
                                <td>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{L.title}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setQuickEntryItem(L);
                                        setQuickMarks(5);
                                        setQuickNote('');
                                      }}
                                      style={{
                                        background: '#c0392b',
                                        color: '#ffffff',
                                        border: 'none',
                                        borderRadius: '5px',
                                        padding: '3px 8px',
                                        fontSize: '11.5px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                      }}
                                      title={`${L.title} ની ઝડપી એન્ટ્રી કરો`}
                                    >
                                      + {t('એન્ટ્રી', 'Entry')}
                                    </button>
                                  </div>
                                </td>
                              </>
                            )
                          ) : <td colSpan="3"></td>}

                          {/* SEPARATOR */}
                          <td style={{ background: '#e2e8f0', border: 'none', padding: 0 }}></td>

                          {/* RIGHT SIDE (SPECIAL) */}
                          {R ? (
                            R.isHdr ? (
                              <td colSpan="3" style={{ background: R.color, color: R.textColor, fontWeight: 800, textAlign: 'center', padding: '7px 10px', fontSize: '13px' }}>
                                {R.title}
                              </td>
                            ) : (
                              <>
                                <td style={{ fontWeight: 800, textAlign: 'center', color: R.category === 'વચનામૃત' ? '#c2410c' : '#4338ca' }}>
                                  {R.num}
                                </td>
                                <td style={{ color: '#475569', fontSize: '12px', fontWeight: 600 }}>{R.sec}</td>
                                <td>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{R.title}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setQuickEntryItem(R);
                                        setQuickMarks(5);
                                        setQuickNote('');
                                      }}
                                      style={{
                                        background: '#c0392b',
                                        color: '#ffffff',
                                        border: 'none',
                                        borderRadius: '5px',
                                        padding: '3px 8px',
                                        fontSize: '11.5px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                      }}
                                      title={`${R.title} ની ઝડપી એન્ટ્રી કરો`}
                                    >
                                      + {t('એન્ટ્રી', 'Entry')}
                                    </button>
                                  </div>
                                </td>
                              </>
                            )
                          ) : <td colSpan="3"></td>}
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= TAB 4: ALL RECORDS ================= */}
        {activeTab === 'records' && (
          <div className="card">
            {/* Top View Mode Switcher Header */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1.5px solid #e2e8f0' }}>
              <div>
                <h2 style={{ color: 'var(--primary)', fontSize: '20px', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{recordViewMode === 'rankwise' ? '🏆' : '📋'}</span>
                  <span>{recordViewMode === 'rankwise' ? t('મુખપાઠ રેન્કવાઇઝ પરિણામ & ઇન્ફોગ્રાફિક્સ', 'Mukhpath Rank-Wise Result & Infographics') : t('તમામ રેકોર્ડ્સ હિસ્ટ્રી', 'All Records History')}</span>
                </h2>
                <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '3px' }}>
                  {recordViewMode === 'rankwise'
                    ? t('સમગ્ર મંડળના સંતો-મુક્તોની સર્વોચ્ચ સાધના, 🥇 🥈 🥉 પોડિયમ, ગુણાંકન, Excel & PDF પ્રિન્ટ રિપોર્ટ', 'Rankwise leaderboard, 3D podium, marks analytics, Excel & PDF print report')
                    : t('મુખપાઠના તમામ સબમિશન, ગુણ અને તારીખવાર ફિલ્ટરિંગ', 'All mukhpath submissions, marks, and date-range filtering')}
                </div>
              </div>

              {/* View Switcher Toggle Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ background: '#f1f5f9', padding: '3px', borderRadius: '10px', display: 'flex', border: '1.5px solid #cbd5e1' }}>
                  <button
                    type="button"
                    onClick={() => setRecordViewMode('list')}
                    style={{
                      padding: '7px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: recordViewMode === 'list' ? 'var(--primary)' : 'transparent',
                      color: recordViewMode === 'list' ? '#ffffff' : '#64748b',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>📋</span> <span>{t('રેકોર્ડ લિસ્ટ', 'Record List')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRecordViewMode('rankwise')}
                    style={{
                      padding: '7px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: recordViewMode === 'rankwise' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
                      color: recordViewMode === 'rankwise' ? '#ffffff' : '#b45309',
                      boxShadow: recordViewMode === 'rankwise' ? '0 2px 10px rgba(245, 158, 11, 0.4)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>🏆</span> <span>{t('રેન્કવાઇઝ પરિણામ (Rank-Wise)', 'Rankwise Result')}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ================= VIEW 1: RECORD LIST MODE ================= */}
            {recordViewMode === 'list' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>
                    {t('કુલ રેકોર્ડ્સ:', 'Total Records:')} {entries.length}
                  </span>
                  {role === 'main' && (
                    <div style={{ background: '#f1f5f9', padding: '3px', borderRadius: '8px', display: 'flex', border: '1px solid #cbd5e1' }}>
                      <button
                        type="button"
                        onClick={() => setRecordFilterStatus('active')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: 'none',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: recordFilterStatus === 'active' ? '#1c3d5a' : 'transparent',
                          color: recordFilterStatus === 'active' ? '#ffffff' : '#64748b'
                        }}
                      >
                        {t('સક્રિય રેકોર્ડ્સ', 'Active')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecordFilterStatus('archived')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: 'none',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: recordFilterStatus === 'archived' ? '#c2410c' : 'transparent',
                          color: recordFilterStatus === 'archived' ? '#ffffff' : '#64748b'
                        }}
                      >
                        🗑️ {t('મુક્તોએ કાઢેલ (Trash)', 'Mukto Archived')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecordFilterStatus('all')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: 'none',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: recordFilterStatus === 'all' ? '#1c3d5a' : 'transparent',
                          color: recordFilterStatus === 'all' ? '#ffffff' : '#64748b'
                        }}
                      >
                        {t('તમામ', 'All')}
                      </button>
                    </div>
                  )}
                </div>

            {/* Filter Controls: Date Range, Quick Presets, Search, Type, Giver */}
            <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'flex-end', marginBottom: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                    🔍 {t('શોધો', 'Search')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('નામ, વચનામૃત, કીર્તન...', 'Name, Vachanamrut, Kirtan...')}
                    value={recSearch}
                    onChange={e => setRecSearch(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                    📖 {t('પ્રકાર', 'Type')}
                  </label>
                  <select
                    value={recTypeFilter}
                    onChange={e => setRecTypeFilter(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                  >
                    <option value="ALL">{t('બધા જ પ્રકાર', 'All Types')}</option>
                    <option value="વચનામૃત">{t('📖 વચનામૃત', '📖 Vachanamrut')}</option>
                    <option value="કીર્તન">{t('🎵 કીર્તન', '🎵 Kirtan')}</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                    👤 {t('આપનાર (ભક્ત)', 'Giver (Devotee)')}
                  </label>
                  <select
                    value={recGiverFilter}
                    onChange={e => setRecGiverFilter(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                  >
                    <option value="ALL">{t('-- તમામ સભ્યો --', '-- All Members --')}</option>
                    {membersList.map((p, idx) => (
                      <option key={idx} value={p.gu}>{getMemberName(p)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                    📅 {t('શરૂઆતની તારીખ', 'From Date')}
                  </label>
                  <input
                    type="date"
                    value={recStartDate}
                    onChange={e => setRecStartDate(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                    📅 {t('અંતિમ તારીખ', 'To Date')}
                  </label>
                  <input
                    type="date"
                    value={recEndDate}
                    onChange={e => setRecEndDate(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
              </div>

              {/* Quick Presets Bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '6px', borderTop: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                  ⚡ {t('ઝડપી સમયગાળો:', 'Quick Presets:')}
                </span>
                <button
                  type="button"
                  onClick={() => setDatePreset('today', 'records')}
                  style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 700, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                >
                  {t('આજે', 'Today')}
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset('week', 'records')}
                  style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 700, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                >
                  {t('આ અઠવાડિયે', 'This Week')}
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset('month', 'records')}
                  style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 700, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                >
                  {t('આ મહિને', 'This Month')}
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset('all', 'records')}
                  style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 700, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                >
                  {t('બધા જ રેકોર્ડ્સ', 'All Records')}
                </button>
                <button
                  type="button"
                  onClick={() => setRecordViewMode('rankwise')}
                  style={{
                    padding: '4px 12px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontWeight: 800,
                    border: '1.5px solid #f59e0b',
                    background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
                    color: '#b45309',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>🏆</span> <span>{t('રેન્કવાઇઝ પરિણામ જુઓ', 'View Rank-Wise Result')}</span>
                </button>
                {(recStartDate || recEndDate || recSearch || recTypeFilter !== 'ALL' || recGiverFilter !== 'ALL') && (
                  <button
                    type="button"
                    onClick={() => { setRecStartDate(''); setRecEndDate(''); setRecSearch(''); setRecTypeFilter('ALL'); setRecGiverFilter('ALL'); }}
                    style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#dc2626', fontWeight: 700, fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    ✕ {t('બધા ફિલ્ટર હટાવો', 'Reset Filters')}
                  </button>
                )}
              </div>
            </div>

            {/* Filtered Records Resolution */}
            {(() => {
              const filteredRecords = entries.filter(e => {
                if (role === 'mukto') {
                  if (e.deletedByMukto) return false;
                } else {
                  if (recordFilterStatus === 'active' && e.deletedByMukto) return false;
                  if (recordFilterStatus === 'archived' && !e.deletedByMukto) return false;
                }
                if (recTypeFilter !== 'ALL' && e.type !== recTypeFilter) return false;
                if (recGiverFilter !== 'ALL' && e.giver !== recGiverFilter) return false;
                if (recStartDate && e.date < recStartDate) return false;
                if (recEndDate && e.date > recEndDate) return false;
                if (recSearch.trim()) {
                  const q = recSearch.toLowerCase();
                  return (e.giver && e.giver.toLowerCase().includes(q)) ||
                         (e.title && e.title.toLowerCase().includes(q)) ||
                         (e.sec && e.sec.toLowerCase().includes(q)) ||
                         String(e.num).includes(q);
                }
                return true;
              });

              const isAllSelected = filteredRecords.length > 0 && filteredRecords.every(r => selectedRecordIds.includes(r.id));

              return (
                <div>
                  {/* Floating Multi-Select Bulk Actions Bar */}
                  {selectedRecordIds.length > 0 && (
                    <div style={{
                      background: '#0f172a',
                      color: '#ffffff',
                      borderRadius: '10px',
                      padding: '12px 18px',
                      marginBottom: '14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>✓</span>
                        <strong style={{ fontSize: '14px' }}>
                          {selectedRecordIds.length} {t('રેકોર્ડ પસંદ કર્યા છે', 'Records Selected')}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-red btn-sm"
                          onClick={handleBulkDelete}
                          style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          <TrashIcon size={14} />
                          <span>{t(`પસંદ કરેલા (${selectedRecordIds.length}) એકસાથે ડિલીટ કરો`, `Delete Selected (${selectedRecordIds.length})`)}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setSelectedRecordIds([])}
                          style={{ color: '#cbd5e1', fontWeight: 700 }}
                        >
                          ✕ {t('પસંદગી રદ કરો', 'Clear')}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="table-responsive">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: '36px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isAllSelected}
                              onChange={() => {
                                if (isAllSelected) {
                                  setSelectedRecordIds([]);
                                } else {
                                  setSelectedRecordIds(filteredRecords.map(r => r.id));
                                }
                              }}
                              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              title={t('તમામ પસંદ કરો / રદ કરો', 'Select / Deselect All')}
                            />
                          </th>
                          <th style={{ width: '40px' }}>{t('ક્રમ', 'No.')}</th>
                          <th>{t('તારીખ', 'Date')}</th>
                          <th>{t('આપનાર', 'Giver')}</th>
                          <th>{t('લેનાર', 'Taker')}</th>
                          <th>{t('પ્રકાર & નંબર', 'Type & No.')}</th>
                          <th>{t('વિગત', 'Detail')}</th>
                          <th>{t('ગુણ', 'Marks')}</th>
                          <th>{t('નોંધ', 'Note')}</th>
                          <th style={{ width: '90px', textAlign: 'center' }}>{t('ક્રિયા', 'Action')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRecords.length === 0 ? (
                          <tr>
                            <td colSpan="10" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                              {t('પસંદ કરેલા ફિલ્ટર્સ મુજબ કોઈ રેકોર્ડ્સ મળ્યા નથી.', 'No records found matching filters.')}
                            </td>
                          </tr>
                        ) : (
                          filteredRecords.map((rec, idx) => {
                            const isSelected = selectedRecordIds.includes(rec.id);
                            return (
                              <tr key={rec.id} style={{ background: isSelected ? '#eff6ff' : (rec.deletedByMukto ? '#fff1f2' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc')) }}>
                                <td style={{ textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {
                                      if (isSelected) {
                                        setSelectedRecordIds(prev => prev.filter(x => x !== rec.id));
                                      } else {
                                        setSelectedRecordIds(prev => [...prev, rec.id]);
                                      }
                                    }}
                                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                  />
                                </td>
                                <td style={{ fontWeight: 800, color: 'var(--primary)' }}>{idx + 1}</td>
                                <td>{rec.date}</td>
                                <td style={{ fontWeight: 700 }}>
                                  {getMemberName(rec.giver)}
                                  {rec.deletedByMukto && (
                                    <span style={{ display: 'block', fontSize: '10.5px', color: '#dc2626', fontWeight: 700 }}>
                                      🗑️ મુક્ત દ્વારા હટાવાયેલ
                                    </span>
                                  )}
                                </td>
                                <td>{getMemberName(rec.taker)}</td>
                                <td>
                                  <span style={{
                                    padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 800,
                                    background: rec.type === 'વચનામૃત' ? 'var(--vach-bg)' : 'var(--kirtan-bg)',
                                    color: rec.type === 'વચનામૃત' ? 'var(--vach-color)' : 'var(--kirtan-color)'
                                  }}>
                                    {rec.type} {rec.num}
                                  </span>
                                </td>
                                <td>{rec.title} <span style={{ fontSize: '11px', color: '#64748b' }}>({rec.sec})</span></td>
                                <td style={{ fontWeight: 800, color: '#15803d' }}>{rec.marks}</td>
                                <td style={{ fontSize: '12px' }}>{rec.note || '-'}</td>
                                <td style={{ textAlign: 'center' }}>
                                  <div style={{ display: 'inline-flex', gap: '6px' }}>
                                    {rec.deletedByMukto && role === 'main' && (
                                      <button
                                        type="button"
                                        className="btn btn-green btn-sm"
                                        title={t('પુનઃ સ્થાપિત કરો', 'Restore')}
                                        onClick={() => handleRestoreEntry(rec.id)}
                                        style={{ padding: '3px 8px', fontSize: '11px' }}
                                      >
                                        🔄 {t('પાછું લાવો', 'Restore')}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="btn btn-red btn-sm"
                                      title={rec.deletedByMukto ? t('કાયમી ડિલીટ', 'Permanent Delete') : t('ડિલીટ કરો', 'Delete')}
                                      onClick={() => handleDeleteEntry(rec.id)}
                                      style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        padding: 0,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      <TrashIcon size={15} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ================= VIEW 2: NOTEBOOKLM INFOGRAPHICS RANK-WISE RESULT MODE ================= */}
        {recordViewMode === 'rankwise' && (() => {
          const rankTotalParticipants = rankwiseResultData.length;
          const rankActiveParticipants = rankwiseResultData.filter(x => x.totalCount > 0).length;
          const rankTotalMarksSum = rankwiseResultData.reduce((acc, x) => acc + x.totalMarks, 0);
          const rankTotalCountSum = rankwiseResultData.reduce((acc, x) => acc + x.totalCount, 0);
          const rankTotalVachMarksSum = rankwiseResultData.reduce((acc, x) => acc + x.vachMarks, 0);
          const rankTotalKirtMarksSum = rankwiseResultData.reduce((acc, x) => acc + x.kirtMarks, 0);
          const rankAvgMarks = rankActiveParticipants > 0 ? (rankTotalMarksSum / rankActiveParticipants).toFixed(1) : '0.0';
          const rankTopper = rankwiseResultData[0] || null;
          const rankRunnerUp = rankwiseResultData[1] || null;
          const rankThird = rankwiseResultData[2] || null;
          const vachRatioPct = rankTotalCountSum > 0 ? Math.round((rankTotalVachMarksSum / (rankTotalMarksSum || 1)) * 100) : 50;

          const periodLabel = recStartDate && recEndDate 
            ? `${recStartDate} થી ${recEndDate}` 
            : recStartDate 
              ? `${recStartDate} પછી` 
              : recEndDate 
                ? `${recEndDate} સુધી` 
                : t('તમામ સમયગાળો (All Time)', 'All Time Records');

          return (
            <div>
              {/* PRINT-ONLY OFFICIAL HEADER FOR PDF / PAPER PRINT */}
              <div className="print-only-header">
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#b45309' }}>॥ શ્રી સ્વામિનારાયણો વિજયતેતરામ્ ॥</div>
                <h1 style={{ fontSize: '20px', margin: '4px 0', fontWeight: 900, color: '#1e293b' }}>
                  SMVS સ્વામિનારાયણ સત્સંગ મંડળ - કેન્દ્રીય મુખપાઠ પોર્ટલ
                </h1>
                <h2 style={{ fontSize: '15px', margin: '2px 0', fontWeight: 800, color: '#475569' }}>
                  સત્તાવાર રેન્કવાઇઝ મુખપાઠ મૂલ્યાંકન પરિણામ પત્રક (Official Rank-Wise Evaluation Sheet)
                </h2>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  મૂલ્યાંકન સમયગાળો: <strong>{periodLabel}</strong> • રિપોર્ટ તારીખ: <strong>{new Date().toLocaleDateString('gu-IN')}</strong> • કુલ સાધકો: <strong>{rankTotalParticipants}</strong>
                </div>
              </div>

              {/* 1. CREATIVE NOTEBOOKLM-STYLE INFOGRAPHIC HERO BANNER */}
              <div className="no-print" style={{
                background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 45%, #fff7ed 100%)',
                border: '2px solid #fde047',
                borderRadius: '16px',
                padding: '18px 22px',
                marginBottom: '18px',
                boxShadow: '0 8px 24px rgba(245, 158, 11, 0.12)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '14px'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '24px' }}>🏆</span>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#92400e' }}>
                      {t('મુખપાઠ મહા-મૂલ્યાંકન રેન્કવાઇઝ પરિણામ (Rank-Wise Leaderboard)', 'Mukhpath Rank-Wise Result & Leaderboard')}
                    </h3>
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#78350f', fontWeight: 600 }}>
                    {t('સમગ્ર મંડળના સંતો-મુક્તોની સર્વોચ્ચ સાધના, ગુણાંકન અને ક્રમાંક પત્રક', 'Comprehensive rankings, marks evaluation, and achievements of all devotees')}
                  </div>
                  <div style={{ marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.7)', padding: '3px 10px', borderRadius: '12px', border: '1px solid #fde047', fontSize: '11.5px', fontWeight: 800, color: '#b45309' }}>
                    <span>📅</span> <span>{t('સમયગાળો:', 'Period:')} {periodLabel}</span>
                  </div>
                </div>

                {/* Export Action Buttons */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-green btn-sm"
                    onClick={handleExportRankwiseExcel}
                    style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 16px', fontSize: '13px', boxShadow: '0 2px 8px rgba(22, 101, 52, 0.2)' }}
                  >
                    <span>📥</span> <span>{t('Excel ફાઇલ ડાઉનલોડ (.CSV)', 'Download Excel')}</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handlePrintRankwise}
                    style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 16px', fontSize: '13px', background: '#4338ca', borderColor: '#3730a3', boxShadow: '0 2px 8px rgba(67, 56, 202, 0.25)' }}
                  >
                    <span>🖨️</span> <span>{t('PDF / પ્રિન્ટ પરિણામ', 'Print / PDF Report')}</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setRecordViewMode('list')}
                    style={{ fontWeight: 700, padding: '8px 14px', fontSize: '12.5px', background: '#ffffff', border: '1.5px solid #cbd5e1' }}
                  >
                    <span>📋</span> <span>{t('રેકોર્ડ લિસ્ટ', 'Record List')}</span>
                  </button>
                </div>
              </div>

              {/* 2. CREATIVE INFOGRAPHIC METRIC KPI STRIP (4 TILES) */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '12px',
                marginBottom: '18px'
              }}>
                {/* Tile 1: Evaluated Devotees */}
                <div style={{ background: '#ffffff', border: '1.5px solid #86efac', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 2px 8px rgba(22, 101, 52, 0.05)' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#166534', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>👥</span> <span>{t('મૂલ્યાંકિત સાધકો', 'Evaluated Participants')}</span>
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: '#15803d', marginTop: '4px' }}>
                    {rankActiveParticipants} <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>/ {rankTotalParticipants}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700, marginTop: '2px' }}>
                    {rankTotalParticipants > 0 ? Math.round((rankActiveParticipants / rankTotalParticipants) * 100) : 0}% સાધકો સક્રિય
                  </div>
                </div>

                {/* Tile 2: Topper Marks */}
                <div style={{ background: '#ffffff', border: '1.5px solid #fde047', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 2px 8px rgba(180, 83, 9, 0.06)' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#b45309', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>👑</span> <span>{t('સર્વોચ્ચ શિખર (Topper)', 'Highest Marks')}</span>
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: '#b45309', marginTop: '4px' }}>
                    {rankTopper ? rankTopper.totalMarks.toFixed(1) : '0'} <span style={{ fontSize: '13px', fontWeight: 700 }}>ગુણ</span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#1e293b', fontWeight: 800, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {rankTopper ? rankTopper.displayName : '-'}
                  </div>
                </div>

                {/* Tile 3: Average Marks */}
                <div style={{ background: '#ffffff', border: '1.5px solid #93c5fd', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 2px 8px rgba(37, 99, 235, 0.05)' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📈</span> <span>{t('મંડળ સરેરાશ સ્કોર', 'Average Marks')}</span>
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: '#1d4ed8', marginTop: '4px' }}>
                    {rankAvgMarks} <span style={{ fontSize: '13px', fontWeight: 700 }}>ગુણ / સાધક</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#2563eb', fontWeight: 700, marginTop: '2px' }}>
                    કુલ {rankTotalCountSum} મુખપાઠ નોંધાયેલ
                  </div>
                </div>

                {/* Tile 4: Vachanamrut vs Kirtan Distribution */}
                <div style={{ background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📖🎵</span> <span>{t('મુખપાઠ ગુણ રેશિયો', 'Marks Ratio')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', fontWeight: 800, marginTop: '6px', marginBottom: '4px' }}>
                    <span style={{ color: '#15803d' }}>📖 વચ: {rankTotalVachMarksSum.toFixed(0)}</span>
                    <span style={{ color: '#2563eb' }}>🎵 કીર્તન: {rankTotalKirtMarksSum.toFixed(0)}</span>
                  </div>
                  <div style={{ background: '#e2e8f0', borderRadius: '6px', height: '9px', overflow: 'hidden', display: 'flex' }}>
                    <div style={{ background: '#10b981', width: `${vachRatioPct}%`, height: '100%' }} />
                    <div style={{ background: '#3b82f6', width: `${100 - vachRatioPct}%`, height: '100%' }} />
                  </div>
                </div>
              </div>

              {/* 3. VISUAL 3D OLYMPIC PODIUM SHOWCASE (TOP 3 CHAMPIONS) */}
              {rankTopper && (
                <div style={{
                  background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '20px 16px 14px 16px',
                  marginBottom: '20px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.04)'
                }}>
                  <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#b45309', background: '#fef3c7', padding: '4px 14px', borderRadius: '20px', border: '1px solid #fde047' }}>
                      ✨ સર્વોચ્ચ શિખર પોડિયમ (Top 3 Champions) ✨
                    </span>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    gap: '14px',
                    flexWrap: 'wrap',
                    paddingTop: '16px'
                  }}>
                    {/* 2nd Place: Silver Medalist */}
                    {rankRunnerUp && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '185px' }}>
                        <div style={{ fontSize: '30px', marginBottom: '-6px' }}>🥈</div>
                        <div style={{
                          width: '52px',
                          height: '52px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #e2e8f0, #94a3b8)',
                          border: '3px solid #cbd5e1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '22px',
                          boxShadow: '0 4px 10px rgba(100,116,139,0.25)',
                          marginBottom: '6px'
                        }}>
                          {rankRunnerUp.role === 'SANTO' ? '🌸' : '👤'}
                        </div>
                        <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#1e293b', textAlign: 'center', lineHeight: '1.2' }}>
                          {rankRunnerUp.displayName}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', textAlign: 'center' }}>
                          {rankRunnerUp.groupName}
                        </div>
                        <div style={{
                          marginTop: '8px',
                          background: 'linear-gradient(180deg, #94a3b8 0%, #64748b 100%)',
                          width: '100%',
                          height: '135px',
                          borderRadius: '12px 12px 0 0',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          boxShadow: '0 6px 14px rgba(71,85,105,0.2)',
                          padding: '10px'
                        }}>
                          <div style={{ fontSize: '22px', fontWeight: 900 }}>2</div>
                          <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>૨nd રેન્ક</div>
                          <div style={{ fontSize: '16px', fontWeight: 900, marginTop: '4px' }}>
                            {rankRunnerUp.totalMarks.toFixed(1)} <span style={{ fontSize: '11px' }}>ગુણ</span>
                          </div>
                          <div style={{ fontSize: '10.5px', opacity: 0.9 }}>{rankRunnerUp.totalCount} મુખપાઠ</div>
                        </div>
                      </div>
                    )}

                    {/* 1st Place: Gold Champion (Center & Elevated) */}
                    {rankTopper && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '220px', zIndex: 2 }}>
                        <div style={{ fontSize: '20px' }}>👑</div>
                        <div style={{ fontSize: '38px', marginTop: '-6px', marginBottom: '-8px' }}>🥇</div>
                        <div style={{
                          width: '66px',
                          height: '66px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #fef08a, #f59e0b)',
                          border: '3.5px solid #fde047',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '28px',
                          boxShadow: '0 6px 16px rgba(245,158,11,0.35)',
                          marginBottom: '6px'
                        }}>
                          {rankTopper.role === 'SANTO' ? '🌸' : '👤'}
                        </div>
                        <div style={{ fontWeight: 900, fontSize: '15px', color: '#854d0e', textAlign: 'center', lineHeight: '1.2' }}>
                          {rankTopper.displayName}
                        </div>
                        <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 700, marginTop: '2px', textAlign: 'center' }}>
                          🌿 {rankTopper.groupName}
                        </div>
                        <div style={{
                          marginTop: '8px',
                          background: 'linear-gradient(180deg, #f59e0b 0%, #b45309 100%)',
                          width: '100%',
                          height: '180px',
                          borderRadius: '14px 14px 0 0',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          boxShadow: '0 8px 22px rgba(180,83,9,0.35)',
                          padding: '12px',
                          border: '2px solid #fde047',
                          borderBottom: 'none'
                        }}>
                          <div style={{ fontSize: '28px', fontWeight: 900 }}>1</div>
                          <div style={{ fontSize: '11.5px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.8px', background: 'rgba(255,255,255,0.25)', padding: '2px 8px', borderRadius: '12px' }}>
                            🏆 સર્વોચ્ચ ચેમ્પિયન
                          </div>
                          <div style={{ fontSize: '20px', fontWeight: 900, marginTop: '6px' }}>
                            {rankTopper.totalMarks.toFixed(1)} <span style={{ fontSize: '12px' }}>ગુણ</span>
                          </div>
                          <div style={{ fontSize: '11px', fontWeight: 700, opacity: 0.95 }}>
                            {rankTopper.totalCount} મુખપાઠ પૂર્ણ
                          </div>
                          <div style={{ fontSize: '10px', marginTop: '6px', background: 'rgba(0,0,0,0.18)', padding: '3px 8px', borderRadius: '6px' }}>
                            📖 {rankTopper.vachMarks.toFixed(1)} • 🎵 {rankTopper.kirtMarks.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 3rd Place: Bronze Medalist */}
                    {rankThird && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '185px' }}>
                        <div style={{ fontSize: '30px', marginBottom: '-6px' }}>🥉</div>
                        <div style={{
                          width: '52px',
                          height: '52px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #fed7aa, #ea580c)',
                          border: '3px solid #fdba74',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '22px',
                          boxShadow: '0 4px 10px rgba(234,88,12,0.25)',
                          marginBottom: '6px'
                        }}>
                          {rankThird.role === 'SANTO' ? '🌸' : '👤'}
                        </div>
                        <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#1e293b', textAlign: 'center', lineHeight: '1.2' }}>
                          {rankThird.displayName}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', textAlign: 'center' }}>
                          {rankThird.groupName}
                        </div>
                        <div style={{
                          marginTop: '8px',
                          background: 'linear-gradient(180deg, #ea580c 0%, #9a3412 100%)',
                          width: '100%',
                          height: '115px',
                          borderRadius: '12px 12px 0 0',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          boxShadow: '0 6px 14px rgba(154,52,18,0.2)',
                          padding: '10px'
                        }}>
                          <div style={{ fontSize: '22px', fontWeight: 900 }}>3</div>
                          <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>૩rd રેન્ક</div>
                          <div style={{ fontSize: '16px', fontWeight: 900, marginTop: '4px' }}>
                            {rankThird.totalMarks.toFixed(1)} <span style={{ fontSize: '11px' }}>ગુણ</span>
                          </div>
                          <div style={{ fontSize: '10.5px', opacity: 0.9 }}>{rankThird.totalCount} મુખપાઠ</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 4. INFOGRAPHIC CONTROLS & FILTER TOOLBAR */}
              <div className="no-print" style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: '12px',
                padding: '14px 16px',
                marginBottom: '18px'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'flex-end', marginBottom: '10px' }}>
                  {/* Search */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                      🔍 {t('સાધક / ગ્રુપ શોધો', 'Search Member / Group')}
                    </label>
                    <input
                      type="text"
                      placeholder={t('નામ અથવા ગ્રુપ લખો...', 'Name or Group...')}
                      value={recSearch}
                      onChange={e => setRecSearch(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>

                  {/* Role Filter */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                      👤 {t('સાધક કેટેગરી', 'Participant Role')}
                    </label>
                    <select
                      value={rankRoleFilter}
                      onChange={e => setRankRoleFilter(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                    >
                      <option value="ALL">{t('તમામ સાધકો (All)', 'All Participants')}</option>
                      <option value="SANTO">{t('🌸 પૂજ્ય સંતો', '🌸 Santo')}</option>
                      <option value="MUKTO">{t('👤 હરિભક્ત મુક્તો', '👤 Muktos')}</option>
                    </select>
                  </div>

                  {/* Sort Criterion */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                      ⭐ {t('રેન્ક ક્રમાંક માપદંડ', 'Sort By')}
                    </label>
                    <select
                      value={rankSortBy}
                      onChange={e => setRankSortBy(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1.5px solid #cbd5e1', fontSize: '13px', fontWeight: 700, color: '#b45309' }}
                    >
                      <option value="marks">⭐ {t('કુલ ગુણ મુજબ (Total Marks)', 'Total Marks')}</option>
                      <option value="count">🎯 {t('કુલ મુખપાઠ સંખ્યા (Total Count)', 'Total Count')}</option>
                      <option value="vach">📖 {t('વચનામૃત ગુણ (Vachanamrut)', 'Vachanamrut Marks')}</option>
                      <option value="kirtan">🎵 {t('કીર્તન ગુણ (Kirtan)', 'Kirtan Marks')}</option>
                    </select>
                  </div>

                  {/* From Date */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                      📅 {t('શરૂઆત તારીખ', 'From Date')}
                    </label>
                    <input
                      type="date"
                      value={recStartDate}
                      onChange={e => setRecStartDate(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>

                  {/* To Date */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                      📅 {t('અંતિમ તારીખ', 'To Date')}
                    </label>
                    <input
                      type="date"
                      value={recEndDate}
                      onChange={e => setRecEndDate(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>
                </div>

                {/* Quick Presets */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '6px', borderTop: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b' }}>
                    ⚡ {t('ઝડપી સમયગાળો:', 'Quick Presets:')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDatePreset('today', 'records')}
                    style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 700, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                  >
                    {t('આજે', 'Today')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDatePreset('week', 'records')}
                    style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 700, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                  >
                    {t('આ અઠવાડિયે', 'This Week')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDatePreset('month', 'records')}
                    style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 700, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                  >
                    {t('આ મહિને', 'This Month')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDatePreset('all', 'records')}
                    style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 700, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                  >
                    {t('તમામ રેકોર્ડ્સ (All Time)', 'All Records')}
                  </button>
                  {(recStartDate || recEndDate || recSearch || rankRoleFilter !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => { setRecStartDate(''); setRecEndDate(''); setRecSearch(''); setRankRoleFilter('ALL'); }}
                      style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#dc2626', fontWeight: 700, fontSize: '11.5px', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      ✕ {t('ફિલ્ટર રીસેટ કરો', 'Reset Filters')}
                    </button>
                  )}
                </div>
              </div>

              {/* 5. INFOGRAPHIC RANK-WISE LEADERBOARD TABLE */}
              <div style={{
                background: '#ffffff',
                border: '1.5px solid #cbd5e1',
                borderRadius: '14px',
                padding: '16px 18px',
                marginBottom: '16px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <strong style={{ fontSize: '15px', color: '#1e3a5f', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📋</span> <span>{t('રેન્કવાઇઝ પરિણામ ડેટા પત્રક (Rankwise Evaluation Matrix)', 'Rankwise Matrix')}</span>
                  </strong>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    કુલ {rankwiseResultData.length} સાધકો નોંધાયેલ
                  </span>
                </div>

                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '70px', textAlign: 'center' }}>{t('રેન્ક', 'Rank')}</th>
                        <th>{t('સાધકનું નામ', 'Devotee / Saint')}</th>
                        <th>{t('મંડળ / ગ્રુપ', 'Group & Leader')}</th>
                        <th style={{ textAlign: 'center', color: '#15803d' }}>📖 વચનામૃત ગુણ (મુખપાઠ)</th>
                        <th style={{ textAlign: 'center', color: '#2563eb' }}>🎵 કીર્તન ગુણ (મુખપાઠ)</th>
                        <th style={{ textAlign: 'center', color: '#b45309' }}>⭐ કુલ મેળવેલ ગુણ</th>
                        <th style={{ textAlign: 'center', color: '#1e3a5f' }}>🎯 કુલ મુખપાઠ</th>
                        <th style={{ minWidth: '130px' }}>ગુણોત્તર (Ratio Bar)</th>
                        <th style={{ textAlign: 'center' }}>{t('ગ્રેડ / સ્થિતિ', 'Grade / Status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankwiseResultData.length === 0 ? (
                        <tr>
                          <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                            {t('પસંદ કરેલા ફિલ્ટર્સ મુજબ કોઈ ડેટા મળ્યો નથી.', 'No records found matching filters.')}
                          </td>
                        </tr>
                      ) : (
                        rankwiseResultData.map((row) => {
                          const isTop1 = row.rank === 1;
                          const isTop2 = row.rank === 2;
                          const isTop3 = row.rank === 3;
                          const isTop10 = row.rank > 3 && row.rank <= 10;
                          const itemTot = row.vachMarks + row.kirtMarks;
                          const vPct = itemTot > 0 ? (row.vachMarks / itemTot) * 100 : 50;

                          const rowBg = isTop1 ? '#fefce8' : isTop2 ? '#f8fafc' : isTop3 ? '#fff7ed' : (row.rank % 2 === 0 ? '#ffffff' : '#f8fafc');

                          return (
                            <tr key={row.id} style={{ background: rowBg }}>
                              {/* Rank Medal */}
                              <td style={{ textAlign: 'center' }}>
                                {isTop1 ? (
                                  <span style={{ fontSize: '13px', background: '#fef08a', color: '#854d0e', padding: '3px 8px', borderRadius: '12px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    🥇 1
                                  </span>
                                ) : isTop2 ? (
                                  <span style={{ fontSize: '13px', background: '#e2e8f0', color: '#334155', padding: '3px 8px', borderRadius: '12px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    🥈 2
                                  </span>
                                ) : isTop3 ? (
                                  <span style={{ fontSize: '13px', background: '#ffedd5', color: '#9a3412', padding: '3px 8px', borderRadius: '12px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    🥉 3
                                  </span>
                                ) : isTop10 ? (
                                  <span style={{ fontSize: '12px', background: '#eff6ff', color: '#1d4ed8', padding: '2px 7px', borderRadius: '10px', fontWeight: 800 }}>
                                    ⭐ {row.rank}
                                  </span>
                                ) : (
                                  <span style={{ fontWeight: 800, color: '#64748b' }}>
                                    {row.rank}
                                  </span>
                                )}
                              </td>

                              {/* Devotee Name & Role */}
                              <td style={{ fontWeight: 800, color: '#1e293b' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>{row.role === 'SANTO' ? '🌸' : '👤'}</span>
                                  <span>{row.displayName}</span>
                                  {isTop1 && (
                                    <span style={{ fontSize: '10px', background: '#fef08a', color: '#854d0e', padding: '1px 5px', borderRadius: '4px', fontWeight: 900 }}>
                                      ચેમ્પિયન
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Group & Leader */}
                              <td style={{ fontSize: '12.5px' }}>
                                <div style={{ fontWeight: 700, color: '#334155' }}>{row.groupName}</div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>લીડર: {row.leaderName}</div>
                              </td>

                              {/* Vachanamrut Marks (Count) */}
                              <td style={{ textAlign: 'center', fontWeight: 800, color: '#15803d' }}>
                                {row.vachMarks.toFixed(1)} <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>({row.vachCount})</span>
                              </td>

                              {/* Kirtan Marks (Count) */}
                              <td style={{ textAlign: 'center', fontWeight: 800, color: '#2563eb' }}>
                                {row.kirtMarks.toFixed(1)} <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>({row.kirtCount})</span>
                              </td>

                              {/* Total Marks */}
                              <td style={{ textAlign: 'center', fontWeight: 900, color: '#b45309', fontSize: '15px' }}>
                                {row.totalMarks.toFixed(1)} <span style={{ fontSize: '11px', fontWeight: 700 }}>ગુણ</span>
                              </td>

                              {/* Total Count */}
                              <td style={{ textAlign: 'center', fontWeight: 900, color: '#1e3a5f', fontSize: '14px' }}>
                                {row.totalCount}
                              </td>

                              {/* Ratio Bar */}
                              <td>
                                <div style={{ background: '#e2e8f0', borderRadius: '6px', height: '10px', overflow: 'hidden', display: 'flex' }}>
                                  <div style={{ background: '#10b981', width: `${vPct}%`, height: '100%' }} title={`વચનામૃત: ${row.vachMarks} ગુણ`} />
                                  <div style={{ background: '#3b82f6', width: `${100 - vPct}%`, height: '100%' }} title={`કીર્તન: ${row.kirtMarks} ગુણ`} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                                  <span>{row.vachCount} વચ.</span>
                                  <span>{row.kirtCount} કી.</span>
                                </div>
                              </td>

                              {/* Grade Badge */}
                              <td style={{ textAlign: 'center' }}>
                                <span style={{
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  background: row.gradeBg,
                                  color: row.gradeColor,
                                  display: 'inline-block'
                                }}>
                                  {row.grade}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* PRINT-ONLY VERIFICATION FOOTER */}
              <div className="print-only-header" style={{ marginTop: '30px', borderTop: '1.5px solid #cbd5e1', borderBottom: 'none', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#334155' }}>
                  <div>
                    <div>પોર્ટલ સંયોજક સહી: _______________________</div>
                    <div style={{ marginTop: '4px' }}>તારીખ: {new Date().toLocaleDateString('gu-IN')}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div>॥ સર્વ જીવ હિતાવહ ॥</div>
                    <div style={{ marginTop: '4px' }}>SMVS કેન્દ્રીય મુખપાઠ સમિતિ</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div>સંત નિરીક્ષક સહી: _______________________</div>
                    <div style={{ marginTop: '4px' }}>મુખ્ય કાર્યાલય મોહિત મહોત્સવ</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
          </div>
        )}

        {/* ================= TAB 5: SUMMARY & MULTI-VIEW PROGRESS CHARTS ================= */}
        {activeTab === 'summary' && (
          <div className="card">
            {/* Dashboard Header (Subtitle removed as requested) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div>
                <h2 style={{ color: '#1e3a5f', fontSize: '20px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📊</span> <span>{t('મુખપાઠ સમરી & પ્રગતિ ચાર્ટ્સ', 'Mukhpath Summary & Progress Charts')}</span>
                </h2>
              </div>

              {/* Sub-View Navigation Pills */}
              <div style={{ background: '#f1f5f9', padding: '4px', borderRadius: '10px', display: 'flex', gap: '4px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setSummarySubTab('overview')}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '7px',
                    fontSize: '13px',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    background: summarySubTab === 'overview' ? '#1c3d5a' : 'transparent',
                    color: summarySubTab === 'overview' ? '#ffffff' : '#475569',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>📊</span> <span>{t('સર્વગ્રાહી ઓવરવ્યૂ', 'Overview')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSummarySubTab('graph')}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '7px',
                    fontSize: '13px',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    background: summarySubTab === 'graph' ? '#1c3d5a' : 'transparent',
                    color: summarySubTab === 'graph' ? '#ffffff' : '#475569',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>📊</span> <span>{t('દ્વિ-દંડ આલેખ (Double Bar Graph)', 'Double Bar Graph')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSummarySubTab('personal')}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '7px',
                    fontSize: '13px',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    background: summarySubTab === 'personal' ? '#1c3d5a' : 'transparent',
                    color: summarySubTab === 'personal' ? '#ffffff' : '#475569',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>👤</span> <span>{t('વ્યક્તિગત વિશ્લેષણ', 'Personal Analysis')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSummarySubTab('groups')}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '7px',
                    fontSize: '13px',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    background: summarySubTab === 'groups' ? '#1c3d5a' : 'transparent',
                    color: summarySubTab === 'groups' ? '#ffffff' : '#475569',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>👥</span> <span>{t('ગ્રુપ સરખામણી', 'Group Comparison')}</span>
                </button>
              </div>
            </div>

            {(() => {
              const totalVachTarget = vachanamrutsList.length || 39;
              const totalKirtTarget = kirtansList.length || 134;
              const totalTarget = totalVachTarget + totalKirtTarget;
              const totalEntriesCount = entries.length;
              const totalVachEntries = entries.filter(e => e.type === 'વચનામૃત').length;
              const totalKirtEntries = entries.filter(e => e.type === 'કીર્તન').length;
              const totalMarksSum = entries.reduce((acc, e) => acc + (typeof e.marks === 'number' ? e.marks : parseFloat(e.marks) || 0), 0);
              const activeDevoteesCount = Object.values(peopleSummaryMap).filter(p => p.count > 0).length;
              const mandalTotalCapacity = membersList.length * totalTarget;
              const mandalOverallPct = mandalTotalCapacity > 0 ? ((totalEntriesCount / mandalTotalCapacity) * 100).toFixed(1) : 0;

              // ================= SUB-TAB 1: OVERVIEW & COMPARATIVE CHARTS =================
              if (summarySubTab === 'overview') {
                const sTerm = summarySearch.trim().toLowerCase();
                const filteredPeople = Object.keys(peopleSummaryMap)
                  .map(name => {
                    const st = peopleSummaryMap[name];
                    const pct = Math.min(100, Math.round((st.count / totalTarget) * 100));
                    return { ...st, pct };
                  })
                  .filter(p => !sTerm || p.name.toLowerCase().includes(sTerm))
                  .sort((a, b) => {
                    if (summarySortBy === 'marks') return b.totalMarks - a.totalMarks;
                    if (summarySortBy === 'count') return b.count - a.count;
                    if (summarySortBy === 'vach') return b.vach - a.vach;
                    if (summarySortBy === 'kirtan') return b.kirtan - a.kirtan;
                    if (summarySortBy === 'name') return a.name.localeCompare(b.name, 'gu');
                    return b.totalMarks - a.totalMarks;
                  });

                return (
                  <div>
                    {/* Top 6 KPI Metric Cards */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                      gap: '12px',
                      marginBottom: '20px'
                    }}>
                      <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>કુલ નોંધાયેલ સભ્યો</div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#1e3a5f', marginTop: '4px' }}>{membersList.length}</div>
                        <div style={{ fontSize: '11.5px', color: '#16a34a', fontWeight: 700, marginTop: '2px' }}>{activeDevoteesCount} સક્રિય સાધકો</div>
                      </div>

                      <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>કુલ મુખપાઠ એન્ટ્રીઓ</div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#1e3a5f', marginTop: '4px' }}>{totalEntriesCount}</div>
                        <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>કુલ નોંધણી</div>
                      </div>

                      <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#c2410c', textTransform: 'uppercase' }}>વચનામૃત એન્ટ્રી</div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#c2410c', marginTop: '4px' }}>{totalVachEntries}</div>
                        <div style={{ fontSize: '11.5px', color: '#9a3412', marginTop: '2px' }}>લક્ષ્ય: {totalVachTarget} / સભ્ય</div>
                      </div>

                      <div style={{ background: '#eef2ff', border: '1.5px solid #c7d2fe', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#4338ca', textTransform: 'uppercase' }}>કીર્તન એન્ટ્રી</div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#4338ca', marginTop: '4px' }}>{totalKirtEntries}</div>
                        <div style={{ fontSize: '11.5px', color: '#3730a3', marginTop: '2px' }}>લક્ષ્ય: {totalKirtTarget} / સભ્ય</div>
                      </div>

                      <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>કુલ મેળવેલ ગુણ</div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#15803d', marginTop: '4px' }}>{totalMarksSum.toFixed(1)}</div>
                        <div style={{ fontSize: '11.5px', color: '#166534', marginTop: '2px' }}>સમગ્ર મંડળ</div>
                      </div>

                      <div style={{ background: '#fefce8', border: '1.5px solid #fef08a', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#a16207', textTransform: 'uppercase' }}>મંડળ પ્રગતિ દર</div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#a16207', marginTop: '4px' }}>{mandalOverallPct}%</div>
                        <div style={{ fontSize: '11.5px', color: '#854d0e', marginTop: '2px' }}>કુલ ક્ષમતા આધારિત</div>
                      </div>
                    </div>

                    {/* Overall Visual Progress Chart Banner */}
                    <div style={{
                      background: '#ffffff',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      marginBottom: '20px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                        <strong style={{ fontSize: '14.5px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>🎯</span> <span>સમગ્ર મંડળ મુખપાઠ પૂર્ણતા પ્રગતિ ગ્રાફ</span>
                        </strong>
                        <div style={{ display: 'flex', gap: '14px', fontSize: '12px', fontWeight: 700 }}>
                          <span style={{ color: '#c2410c' }}>● વચનામૃત ({totalVachEntries})</span>
                          <span style={{ color: '#4338ca' }}>● કીર્તન ({totalKirtEntries})</span>
                        </div>
                      </div>

                      {/* Multi-Segment Graphical Progress Bar */}
                      <div style={{ background: '#e2e8f0', borderRadius: '12px', height: '18px', overflow: 'hidden', display: 'flex' }}>
                        <div
                          style={{
                            background: 'linear-gradient(90deg, #ea580c, #f97316)',
                            width: `${mandalTotalCapacity > 0 ? (totalVachEntries / mandalTotalCapacity) * 100 : 0}%`,
                            height: '100%',
                            transition: 'width 0.4s ease'
                          }}
                          title={`વચનામૃત એન્ટ્રીઓ: ${totalVachEntries}`}
                        />
                        <div
                          style={{
                            background: 'linear-gradient(90deg, #4f46e5, #6366f1)',
                            width: `${mandalTotalCapacity > 0 ? (totalKirtEntries / mandalTotalCapacity) * 100 : 0}%`,
                            height: '100%',
                            transition: 'width 0.4s ease'
                          }}
                          title={`કીર્તન એન્ટ્રીઓ: ${totalKirtEntries}`}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                        <span>કુલ લક્ષ્ય: {membersList.length} સભ્યો × {totalTarget} = {mandalTotalCapacity} મુખપાઠ</span>
                        <span style={{ fontWeight: 800, color: '#1e293b' }}>કુલ પૂર્ણ: {totalEntriesCount} ({mandalOverallPct}%)</span>
                      </div>
                    </div>

                    {/* Leaderboard Controls (Filter & Sort) */}
                    <div style={{
                      background: '#f8fafc',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '10px',
                      padding: '12px 16px',
                      marginBottom: '16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
                        <input
                          type="text"
                          placeholder="🔍 સાધકનું નામ શોધો..."
                          value={summarySearch}
                          onChange={e => setSummarySearch(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '8px',
                            fontSize: '13.5px',
                            background: '#ffffff',
                            color: '#1e293b'
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                          ક્રમ ગોઠવો:
                        </label>
                        <select
                          value={summarySortBy}
                          onChange={e => setSummarySortBy(e.target.value)}
                          style={{
                            padding: '8px 12px',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 700,
                            color: '#1e293b',
                            background: '#ffffff'
                          }}
                        >
                          <option value="marks">⭐ સૌથી વધુ ગુણ (Marks)</option>
                          <option value="count">🎯 કુલ મુખપાઠ સંખ્યા (Count)</option>
                          <option value="vach">📖 વચનામૃત સંખ્યા (Vachanamrut)</option>
                          <option value="kirtan">🎵 કીર્તન સંખ્યા (Kirtan)</option>
                          <option value="name">🔤 નામ મુજબ (A to Z)</option>
                        </select>
                      </div>
                    </div>

                    {/* Devotees Comparative Leaderboard with Visual Bars */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {filteredPeople.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '36px', color: '#64748b', background: '#f8fafc', borderRadius: '10px' }}>
                          કોઈ સાધક મળ્યા નથી. કૃપા કરીને શોધવાનો શબ્દ બદલો.
                        </div>
                      ) : (
                        filteredPeople.map((st, idx) => {
                          const isTop1 = idx === 0 && st.count > 0;
                          const isTop2 = idx === 1 && st.count > 0;
                          const isTop3 = idx === 2 && st.count > 0;

                          const rankBadge = isTop1 ? '🥇 1st' : isTop2 ? '🥈 2nd' : isTop3 ? '🥉 3rd' : `#${idx + 1}`;
                          const vachPctOfPerson = Math.min(100, Math.round((st.vach / totalTarget) * 100));
                          const kirtPctOfPerson = Math.min(100, Math.round((st.kirtan / totalTarget) * 100));

                          return (
                            <div
                              key={st.name}
                              style={{
                                background: isTop1 ? '#fffdf5' : '#ffffff',
                                border: isTop1 ? '2px solid #f59e0b' : isTop2 ? '1.5px solid #94a3b8' : isTop3 ? '1.5px solid #d97706' : '1.5px solid #e2e8f0',
                                borderRadius: '12px',
                                padding: '14px 18px',
                                boxShadow: isTop1 ? '0 4px 12px rgba(245, 158, 11, 0.12)' : '0 1px 3px rgba(0,0,0,0.03)',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 900,
                                    background: isTop1 ? '#fef3c7' : isTop2 ? '#f1f5f9' : isTop3 ? '#ffedd5' : '#f1f5f9',
                                    color: isTop1 ? '#b45309' : isTop2 ? '#475569' : isTop3 ? '#c2410c' : '#64748b',
                                    minWidth: '46px'
                                  }}>
                                    {rankBadge}
                                  </span>

                                  <div>
                                    <strong style={{ fontSize: '15.5px', color: '#1e293b' }}>{st.name}</strong>
                                    <span style={{
                                      marginLeft: '8px',
                                      padding: '2px 7px',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      fontWeight: 800,
                                      background: st.role === 'SWAMI' ? '#fff7ed' : '#eef2ff',
                                      color: st.role === 'SWAMI' ? '#c2410c' : '#4338ca'
                                    }}>
                                      {st.role === 'SWAMI' ? 'સંત' : 'મુક્ત'}
                                    </span>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                  <span style={{ fontSize: '16px', fontWeight: 900, color: '#15803d' }}>
                                    {st.totalMarks.toFixed(1)} <span style={{ fontSize: '12px', fontWeight: 700 }}>ગુણ</span>
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSummarySelectedPerson(st.name);
                                      setSummarySubTab('personal');
                                    }}
                                    style={{
                                      background: '#f1f5f9',
                                      color: '#1e3a5f',
                                      border: '1px solid #cbd5e1',
                                      borderRadius: '6px',
                                      padding: '4px 10px',
                                      fontSize: '12px',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                    title="વ્યક્તિગત એનાલિટિક્સ જુઓ"
                                  >
                                    👁️ વિગત
                                  </button>
                                </div>
                              </div>

                              {/* Graphical Progress Bar for this member */}
                              <div style={{ background: '#f1f5f9', borderRadius: '8px', height: '10px', overflow: 'hidden', display: 'flex', marginBottom: '8px' }}>
                                <div
                                  style={{
                                    background: '#ea580c',
                                    width: `${vachPctOfPerson}%`,
                                    height: '100%',
                                    transition: 'width 0.3s ease'
                                  }}
                                  title={`વચનામૃત: ${st.vach} / ${totalVachTarget}`}
                                />
                                <div
                                  style={{
                                    background: '#6366f1',
                                    width: `${kirtPctOfPerson}%`,
                                    height: '100%',
                                    transition: 'width 0.3s ease'
                                  }}
                                  title={`કીર્તન: ${st.kirtan} / ${totalKirtTarget}`}
                                />
                              </div>

                              {/* Breakdown details */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#64748b', flexWrap: 'wrap', gap: '6px' }}>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                  <span>📖 વચનામૃત: <strong style={{ color: '#c2410c' }}>{st.vach}</strong> / {totalVachTarget}</span>
                                  <span>🎵 કીર્તન: <strong style={{ color: '#4338ca' }}>{st.kirtan}</strong> / {totalKirtTarget}</span>
                                  <span>🎯 કુલ: <strong style={{ color: '#1e293b' }}>{st.count}</strong> / {totalTarget}</span>
                                </div>
                                <span style={{ fontWeight: 800, color: st.pct > 0 ? '#15803d' : '#94a3b8' }}>
                                  {st.pct}% પૂર્ણ
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              }

              // ================= SUB-TAB: DOUBLE BAR GRAPH & DECORATIVE ANALYTICS (દ્વિ-દંડ આલેખ - Image 2) =================
              if (summarySubTab === 'graph') {
                const graphItems = doubleBarGraphData;
                const totalItems = graphItems.length;

                // Find max value across all items
                const rawMax = Math.max(
                  ...graphItems.map(d => Math.max(d.vachVal || 0, d.kirtVal || 0)),
                  5
                );
                // Round maxVal up to nice step
                const niceMaxVal = rawMax <= 10 ? 10 : Math.ceil(rawMax / 5) * 5;

                // Explicitly compute Total Marks and Total Count across all items
                const graphTotalCount = graphItems.reduce((acc, it) => acc + (it.totalCount || 0), 0);
                const graphTotalMarks = graphItems.reduce((acc, it) => acc + (it.totalMarks || 0), 0);
                const graphTotalVachCount = graphItems.reduce((acc, it) => acc + (it.vachCount || 0), 0);
                const graphTotalKirtCount = graphItems.reduce((acc, it) => acc + (it.kirtCount || 0), 0);
                const graphTotalVachMarks = graphItems.reduce((acc, it) => acc + (it.vachMarks || 0), 0);
                const graphTotalKirtMarks = graphItems.reduce((acc, it) => acc + (it.kirtMarks || 0), 0);

                const vachSharePct = graphTotalCount > 0 ? ((graphTotalVachCount / graphTotalCount) * 100).toFixed(0) : 50;
                const kirtSharePct = graphTotalCount > 0 ? ((graphTotalKirtCount / graphTotalCount) * 100).toFixed(0) : 50;

                // Peak item based on total marks and count
                let peakItem = graphItems[0] || { name: '-', totalMarks: 0, totalCount: 0, vachCount: 0, kirtCount: 0 };
                graphItems.forEach(it => {
                  if ((it.totalMarks || 0) > (peakItem.totalMarks || 0)) {
                    peakItem = it;
                  }
                });

                // Theme Palette Definition
                const themePalette = {
                  green: {
                    name: '🍃 પાવન ગ્રીન',
                    cardBg: '#f4fbf5',
                    cardBorder: '2px solid #86efac',
                    boxShadow: '0 8px 24px rgba(22, 101, 52, 0.12)',
                    accent: '#15803d',
                    axisColor: '#15803d',
                    gridMinor: '#dcfce7',
                    gridMajor: '#bbf7d0',
                    vachGrad1: '#10b981',
                    vachGrad2: '#047857',
                    vachStroke: '#065f46',
                    kirtGrad1: '#3b82f6',
                    kirtGrad2: '#1d4ed8',
                    kirtStroke: '#1e3a8a',
                    pillBorderVach: '#059669',
                    pillBorderKirt: '#2563eb'
                  },
                  sapphire: {
                    name: '💎 રોયલ સફાયર',
                    cardBg: '#f0f7ff',
                    cardBorder: '2px solid #93c5fd',
                    boxShadow: '0 8px 24px rgba(30, 64, 175, 0.12)',
                    accent: '#1e40af',
                    axisColor: '#1e40af',
                    gridMinor: '#e0f2fe',
                    gridMajor: '#bae6fd',
                    vachGrad1: '#06b6d4',
                    vachGrad2: '#0e7490',
                    vachStroke: '#155e75',
                    kirtGrad1: '#6366f1',
                    kirtGrad2: '#4338ca',
                    kirtStroke: '#3730a3',
                    pillBorderVach: '#0891b2',
                    pillBorderKirt: '#4f46e5'
                  },
                  gold: {
                    name: '🌅 ગોલ્ડન એમ્બર',
                    cardBg: '#fffdf5',
                    cardBorder: '2px solid #fde047',
                    boxShadow: '0 8px 24px rgba(180, 83, 9, 0.12)',
                    accent: '#b45309',
                    axisColor: '#b45309',
                    gridMinor: '#fef9c3',
                    gridMajor: '#fef08a',
                    vachGrad1: '#f59e0b',
                    vachGrad2: '#b45309',
                    vachStroke: '#78350f',
                    kirtGrad1: '#ec4899',
                    kirtGrad2: '#be185d',
                    kirtStroke: '#9d174d',
                    pillBorderVach: '#d97706',
                    pillBorderKirt: '#db2777'
                  }
                };
                const curTheme = themePalette[graphTheme] || themePalette.green;

                // SVG layout configuration
                const svgW = 980;
                const svgH = 510;
                const padL = 75;
                const padR = 45;
                const padT = 50;
                const padB = 125;
                const plotW = svgW - padL - padR;
                const plotH = svgH - padT - padB;
                const baseY = padT + plotH;

                const slotWidth = totalItems > 0 ? plotW / totalItems : plotW;
                const barWidth = Math.min(28, Math.max(12, slotWidth * 0.33));
                const barGap = 4;

                // Y-axis ticks (5 levels: 0, 25%, 50%, 75%, 100%)
                const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
                  val: Math.round(niceMaxVal * pct),
                  y: baseY - pct * plotH
                }));

                return (
                  <div>
                    {/* 1. TOP DECORATIVE HIGHLIGHTS RIBBON */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '12px',
                      marginBottom: '16px'
                    }}>
                      {/* Peak Bucket / Leader */}
                      <div style={{
                        background: '#ffffff',
                        border: '1.5px solid #fde047',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.08)'
                      }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                          🏆
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 800, color: '#b45309', textTransform: 'uppercase' }}>
                            સર્વોચ્ચ સાધક
                          </div>
                          <div style={{ fontSize: '15px', fontWeight: 900, color: '#1e293b', marginTop: '1px' }}>
                            {peakItem.name || peakItem.labelSub || '-'}
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#16a34a', fontWeight: 800 }}>
                            ⭐ {peakItem.totalMarks.toFixed(1)} ગુણ ({peakItem.totalCount} મુખપાઠ)
                          </div>
                        </div>
                      </div>

                      {/* Total Marks */}
                      <div style={{
                        background: '#ffffff',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                      }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                          🎯
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>
                            કુલ મુખપાઠ ગુણ
                          </div>
                          <div style={{ fontSize: '17px', fontWeight: 900, color: '#1e3a5f', marginTop: '1px' }}>
                            {graphTotalMarks.toFixed(1)} <span style={{ fontSize: '12px', fontWeight: 700 }}>ગુણ</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>
                            કુલ {graphTotalCount} મુખપાઠ નોંધાયેલ
                          </div>
                        </div>
                      </div>

                      {/* Vachanamrut Marks & Count */}
                      <div style={{
                        background: '#ffffff',
                        border: '1.5px solid #86efac',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        boxShadow: '0 2px 8px rgba(22, 101, 52, 0.06)'
                      }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                          📖
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 800, color: '#15803d', textTransform: 'uppercase' }}>
                            વચનામૃત ગુણ
                          </div>
                          <div style={{ fontSize: '17px', fontWeight: 900, color: '#15803d', marginTop: '1px' }}>
                            {graphTotalVachMarks.toFixed(1)} <span style={{ fontSize: '12px', fontWeight: 700 }}>ગુણ</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#166534', fontWeight: 700 }}>
                            {graphTotalVachCount} મુખપાઠ ({vachSharePct}%)
                          </div>
                        </div>
                      </div>

                      {/* Kirtan Marks & Count */}
                      <div style={{
                        background: '#ffffff',
                        border: '1.5px solid #93c5fd',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        boxShadow: '0 2px 8px rgba(37, 99, 235, 0.06)'
                      }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                          🎵
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase' }}>
                            કીર્તન ગુણ
                          </div>
                          <div style={{ fontSize: '17px', fontWeight: 900, color: '#2563eb', marginTop: '1px' }}>
                            {graphTotalKirtMarks.toFixed(1)} <span style={{ fontSize: '12px', fontWeight: 700 }}>ગુણ</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: 700 }}>
                            {graphTotalKirtCount} મુખપાઠ ({kirtSharePct}%)
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 2. MULTI-CONTROL TOOLBAR (Views, Clean Styles, Themes) */}
                    <div style={{
                      background: '#ffffff',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '12px',
                      padding: '14px 18px',
                      marginBottom: '16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '14px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                    }}>
                      {/* Left: View selector */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e3a5f' }}>
                          📊 {t('આલેખ વ્યુ:', 'View:')}
                        </span>
                        <div style={{ background: '#f1f5f9', padding: '3px', borderRadius: '8px', display: 'flex', gap: '3px', border: '1px solid #e2e8f0' }}>
                          <button
                            type="button"
                            onClick={() => setBarGraphView('devotees')}
                            style={{
                              padding: '5px 14px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 800,
                              border: 'none',
                              cursor: 'pointer',
                              background: barGraphView === 'devotees' ? '#15803d' : 'transparent',
                              color: barGraphView === 'devotees' ? '#ffffff' : '#475569'
                            }}
                          >
                            👤 {t('સાધકવાર (નામ સાથે)', 'Devotees')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setBarGraphView('groups')}
                            style={{
                              padding: '5px 14px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 800,
                              border: 'none',
                              cursor: 'pointer',
                              background: barGraphView === 'groups' ? '#15803d' : 'transparent',
                              color: barGraphView === 'groups' ? '#ffffff' : '#475569'
                            }}
                          >
                            👥 {t('ગ્રુપવાર (લીડર સાથે)', 'Groups')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setBarGraphView('marks')}
                            style={{
                              padding: '5px 14px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 800,
                              border: 'none',
                              cursor: 'pointer',
                              background: barGraphView === 'marks' ? '#15803d' : 'transparent',
                              color: barGraphView === 'marks' ? '#ffffff' : '#475569'
                            }}
                          >
                            ⭐ {t('ગુણ વિતરણ (Marks)', 'Marks Tier')}
                          </button>
                        </div>
                      </div>

                      {/* Center: Simplified Clean Graph Style Switcher */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e3a5f' }}>
                          🎨 {t('ગ્રાફ પ્રકાર:', 'Type:')}
                        </span>
                        <div style={{ background: '#f1f5f9', padding: '3px', borderRadius: '8px', display: 'flex', gap: '3px', border: '1px solid #e2e8f0' }}>
                          <button
                            type="button"
                            onClick={() => setGraphStyle('bars')}
                            style={{
                              padding: '5px 14px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 800,
                              border: 'none',
                              cursor: 'pointer',
                              background: graphStyle === 'bars' ? '#2563eb' : 'transparent',
                              color: graphStyle === 'bars' ? '#ffffff' : '#475569'
                            }}
                          >
                            📊 {t('સ્તંભ આલેખ (Bar Graph)', 'Bar Graph')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setGraphStyle('donut')}
                            style={{
                              padding: '5px 14px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 800,
                              border: 'none',
                              cursor: 'pointer',
                              background: graphStyle === 'donut' ? '#2563eb' : 'transparent',
                              color: graphStyle === 'donut' ? '#ffffff' : '#475569'
                            }}
                          >
                            🍩 {t('વર્તુળાકાર આલેખ (Circular Chart)', 'Circular Chart')}
                          </button>
                        </div>
                      </div>

                      {/* Right: Theme Switcher */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                          {t('થીમ:', 'Theme:')}
                        </span>
                        {Object.keys(themePalette).map(thKey => (
                          <button
                            key={thKey}
                            type="button"
                            onClick={() => setGraphTheme(thKey)}
                            style={{
                              padding: '4px 9px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              border: graphTheme === thKey ? `2px solid ${themePalette[thKey].accent}` : '1px solid #cbd5e1',
                              background: graphTheme === thKey ? themePalette[thKey].cardBg : '#ffffff',
                              color: themePalette[thKey].accent
                            }}
                          >
                            {themePalette[thKey].name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 3. MAIN CLEAN DECORATIVE BAR GRAPH CANVAS (NO DOTTED LINES, NAMES CLEARLY VISIBLE) */}
                    {graphStyle === 'bars' && (
                      <div style={{
                        background: curTheme.cardBg,
                        border: curTheme.cardBorder,
                        borderRadius: '16px',
                        padding: '16px 12px 14px 12px',
                        marginBottom: '20px',
                        boxShadow: curTheme.boxShadow,
                        overflowX: 'auto',
                        position: 'relative'
                      }}>
                        <svg
                          viewBox={`0 0 ${svgW} ${svgH}`}
                          style={{ width: '100%', height: 'auto', minWidth: '740px', display: 'block' }}
                        >
                          <defs>
                            {/* Fine grid lines */}
                            <pattern id="fineGrid" width="16" height="16" patternUnits="userSpaceOnUse">
                              <path d="M 16 0 L 0 0 0 16" fill="none" stroke={curTheme.gridMinor} strokeWidth="0.8" />
                            </pattern>
                            {/* Major grid lines (every 80px) */}
                            <pattern id="graphGridMajor" width="80" height="80" patternUnits="userSpaceOnUse">
                              <rect width="80" height="80" fill="url(#fineGrid)" />
                              <path d="M 80 0 L 0 0 0 80" fill="none" stroke={curTheme.gridMajor} strokeWidth="1.4" />
                            </pattern>
                            {/* Arrow markers */}
                            <marker id="arrowUp" markerWidth="10" markerHeight="10" refX="5" refY="3" orient="auto">
                              <path d="M0,6 L5,0 L10,6 L5,4.5 Z" fill={curTheme.axisColor} />
                            </marker>
                            <marker id="arrowRight" markerWidth="10" markerHeight="10" refX="3" refY="5" orient="auto">
                              <path d="M0,0 L6,5 L0,10 L1.5,5 Z" fill={curTheme.axisColor} />
                            </marker>

                            {/* Rich Linear Gradients for Bars */}
                            <linearGradient id="vachGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor={curTheme.vachGrad1} />
                              <stop offset="100%" stopColor={curTheme.vachGrad2} />
                            </linearGradient>
                            <linearGradient id="kirtGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor={curTheme.kirtGrad1} />
                              <stop offset="100%" stopColor={curTheme.kirtGrad2} />
                            </linearGradient>

                            {/* Drop shadow filters for clean 3D look */}
                            <filter id="pillShadow" x="-10%" y="-10%" width="120%" height="120%">
                              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.08" />
                            </filter>
                            <filter id="barShadow" x="-10%" y="-5%" width="120%" height="110%">
                              <feDropShadow dx="1" dy="3" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.12" />
                            </filter>
                          </defs>

                          {/* Graph Paper Grid Background */}
                          <rect x={padL - 15} y={padT - 15} width={plotW + 35} height={plotH + 20} fill="url(#graphGridMajor)" rx="8" />

                          {/* Horizontal Ticks & Dotted Grid Lines */}
                          {yTicks.map((tck, idx) => (
                            <g key={`yt_${idx}`}>
                              <line
                                x1={padL}
                                y1={tck.y}
                                x2={padL + plotW}
                                y2={tck.y}
                                stroke={curTheme.gridMajor}
                                strokeWidth={idx === 0 ? "1.8" : "1"}
                                strokeDasharray={idx === 0 ? "none" : "4 4"}
                              />
                              <text
                                x={padL - 10}
                                y={tck.y + 4}
                                fill={curTheme.axisColor}
                                fontSize="11"
                                fontWeight="800"
                                textAnchor="end"
                              >
                                {tck.val}
                              </text>
                            </g>
                          ))}

                          {/* Y-Axis Arrow & Line */}
                          <line
                            x1={padL}
                            y1={baseY}
                            x2={padL}
                            y2={padT - 22}
                            stroke={curTheme.axisColor}
                            strokeWidth="2.5"
                            markerEnd="url(#arrowUp)"
                          />
                          <text x={padL} y={padT - 28} fill={curTheme.axisColor} fontSize="13" fontWeight="900" textAnchor="middle">
                            Y
                          </text>
                          <text
                            transform={`rotate(-90)`}
                            x={-(padT + plotH / 2)}
                            y={padL - 45}
                            fill={curTheme.axisColor}
                            fontSize="11.5"
                            fontWeight="800"
                            textAnchor="middle"
                          >
                            ↑ સાધના મુખપાઠ {barGraphMetric === 'marks' ? '(ગુણ)' : '(સંખ્યા)'}
                          </text>

                          {/* X-Axis Arrow & Line */}
                          <line
                            x1={padL}
                            y1={baseY}
                            x2={padL + plotW + 20}
                            y2={baseY}
                            stroke={curTheme.axisColor}
                            strokeWidth="2.5"
                            markerEnd="url(#arrowRight)"
                          />
                          <text x={padL + plotW + 26} y={baseY + 4} fill={curTheme.axisColor} fontSize="13" fontWeight="900" textAnchor="start">
                            X
                          </text>

                          {/* Decorative Legend Box */}
                          <g transform={`translate(${svgW - 230}, ${padT - 30})`}>
                            <rect
                              x="0"
                              y="0"
                              width="200"
                              height="36"
                              rx="8"
                              fill="#ffffff"
                              stroke={curTheme.gridMajor}
                              strokeWidth="1.5"
                              filter="url(#pillShadow)"
                            />
                            {/* Vach indicator */}
                            <rect x="12" y="11" width="14" height="14" rx="3" fill="url(#vachGrad)" stroke={curTheme.vachStroke} strokeWidth="1" />
                            <text x="32" y="23" fill="#1e293b" fontSize="12" fontWeight="800">
                              વચનામૃત
                            </text>
                            {/* Kirtan indicator */}
                            <rect x="110" y="11" width="14" height="14" rx="3" fill="url(#kirtGrad)" stroke={curTheme.kirtStroke} strokeWidth="1" />
                            <text x="130" y="23" fill="#1e293b" fontSize="12" fontWeight="800">
                              કીર્તન
                            </text>
                          </g>

                          {/* Clean 3D Dual Bars (No Dotted Lines / Splines) */}
                          {graphItems.map((item, idx) => {
                            const cx = padL + (idx + 0.5) * slotWidth;
                            const vachX = cx - barWidth - barGap / 2;
                            const kirtX = cx + barGap / 2;

                            const vH = niceMaxVal > 0 ? (item.vachVal / niceMaxVal) * plotH : 0;
                            const kH = niceMaxVal > 0 ? (item.kirtVal / niceMaxVal) * plotH : 0;

                            const vY = baseY - vH;
                            const kY = baseY - kH;

                            const displayName = item.name || item.labelSub || item.label;

                            return (
                              <g key={`bar_${idx}`}>
                                {/* Vachanamrut Bar (Green / Custom) with 3D Gloss */}
                                <rect
                                  x={vachX}
                                  y={vY}
                                  width={barWidth}
                                  height={Math.max(vH, 0)}
                                  fill="url(#vachGrad)"
                                  stroke={curTheme.vachStroke}
                                  strokeWidth="1"
                                  rx="4"
                                  filter="url(#barShadow)"
                                >
                                  <title>{`${displayName}: વચનામૃત ${item.vachMarks} ગુણ (${item.vachCount} મુખપાઠ)`}</title>
                                </rect>
                                {/* Glossy top edge reflection */}
                                {vH > 6 && (
                                  <line
                                    x1={vachX + 3}
                                    y1={vY + 2}
                                    x2={vachX + barWidth - 3}
                                    y2={vY + 2}
                                    stroke="rgba(255,255,255,0.7)"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                  />
                                )}

                                {/* Kirtan Bar (Blue / Custom) with 3D Gloss */}
                                <rect
                                  x={kirtX}
                                  y={kY}
                                  width={barWidth}
                                  height={Math.max(kH, 0)}
                                  fill="url(#kirtGrad)"
                                  stroke={curTheme.kirtStroke}
                                  strokeWidth="1"
                                  rx="4"
                                  filter="url(#barShadow)"
                                >
                                  <title>{`${displayName}: કીર્તન ${item.kirtMarks} ગુણ (${item.kirtCount} મુખપાઠ)`}</title>
                                </rect>
                                {/* Glossy top edge reflection */}
                                {kH > 6 && (
                                  <line
                                    x1={kirtX + 3}
                                    y1={kY + 2}
                                    x2={kirtX + barWidth - 3}
                                    y2={kY + 2}
                                    stroke="rgba(255,255,255,0.7)"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                  />
                                )}

                                {/* Crisp Pill Badge on top of Vachanamrut bar */}
                                {item.vachVal > 0 && (
                                  <g transform={`translate(${vachX + barWidth / 2 - 14}, ${vY - 20})`}>
                                    <rect width="28" height="16" rx="4" fill="#ffffff" stroke={curTheme.pillBorderVach} strokeWidth="1.2" filter="url(#pillShadow)" />
                                    <text x="14" y="12" fill={curTheme.vachStroke} fontSize="10.5" fontWeight="900" textAnchor="middle">
                                      {item.vachVal}
                                    </text>
                                  </g>
                                )}

                                {/* Crisp Pill Badge on top of Kirtan bar */}
                                {item.kirtVal > 0 && (
                                  <g transform={`translate(${kirtX + barWidth / 2 - 14}, ${kY - 20})`}>
                                    <rect width="28" height="16" rx="4" fill="#ffffff" stroke={curTheme.pillBorderKirt} strokeWidth="1.2" filter="url(#pillShadow)" />
                                    <text x="14" y="12" fill={curTheme.kirtStroke} fontSize="10.5" fontWeight="900" textAnchor="middle">
                                      {item.kirtVal}
                                    </text>
                                  </g>
                                )}

                                {/* X-axis tick mark */}
                                <line x1={cx} y1={baseY} x2={cx} y2={baseY + 6} stroke={curTheme.axisColor} strokeWidth="1.5" />

                                {/* Full Names & Labels on X-axis without ANY truncation */}
                                {barGraphView === 'marks' ? (
                                  <g>
                                    {/* Mark Level Pill (e.g. 5 ગુણ, 4.5 ગુણ) */}
                                    <g transform={`translate(${cx - 28}, ${baseY + 10})`}>
                                      <rect width="56" height="22" rx="5" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.2" filter="url(#pillShadow)" />
                                      <text x="28" y="15" fill="#1e293b" fontSize="11" fontWeight="900" textAnchor="middle">
                                        {item.label} ગુણ
                                      </text>
                                    </g>
                                    {/* Full Devotee / Saint Name(s) below the pill angled at -40° */}
                                    {item.giverNames && (
                                      <g transform={`translate(${cx}, ${baseY + 38}) rotate(-40)`}>
                                        <text x="0" y="0" textAnchor="end" fill="#047857" fontSize="11.5" fontWeight="800">
                                          👤 {item.giverNames}
                                        </text>
                                      </g>
                                    )}
                                  </g>
                                ) : (
                                  /* Devotee / Group View: Full Name angled at -45° without any truncation */
                                  <g transform={`translate(${cx}, ${baseY + 14}) rotate(-45)`}>
                                    <text x="0" y="0" textAnchor="end" fill="#1e293b" fontSize="11.5" fontWeight="800">
                                      {barGraphView === 'groups' ? '👥 ' : '👤 '}{displayName}
                                    </text>
                                  </g>
                                )}
                              </g>
                            );
                          })}

                          {/* Centered Clean Bottom Title */}
                          <text
                            x={svgW / 2}
                            y={svgH - 12}
                            textAnchor="middle"
                            fontSize="15"
                            fontWeight="900"
                            fill={curTheme.accent}
                            letterSpacing="0.5"
                          >
                            📊 મુખપાઠ પ્રગતિ આલેખ (Mukhpath Progress Graph)
                          </text>
                        </svg>
                      </div>
                    )}

                    {/* 4. MAIN CIRCULAR / DONUT CHART */}
                    {graphStyle === 'donut' && (
                      <div style={{
                        background: curTheme.cardBg,
                        border: curTheme.cardBorder,
                        borderRadius: '16px',
                        padding: '24px',
                        marginBottom: '20px',
                        boxShadow: curTheme.boxShadow
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexWrap: 'wrap', gap: '24px' }}>
                          {/* Left: Dual Radial Concentric Donut Gauge */}
                          <div style={{ textAlign: 'center' }}>
                            <svg width="240" height="240" viewBox="0 0 240 240">
                              {/* Background circles */}
                              <circle cx="120" cy="120" r="95" fill="none" stroke="#e2e8f0" strokeWidth="16" />
                              <circle cx="120" cy="120" r="70" fill="none" stroke="#e2e8f0" strokeWidth="16" />

                              {/* Vachanamrut Ring (Outer) */}
                              <circle
                                cx="120"
                                cy="120"
                                r="95"
                                fill="none"
                                stroke={curTheme.vachGrad1}
                                strokeWidth="16"
                                strokeDasharray={`${(parseFloat(vachSharePct) / 100) * 2 * Math.PI * 95} ${2 * Math.PI * 95}`}
                                strokeLinecap="round"
                                transform="rotate(-90 120 120)"
                              />

                              {/* Kirtan Ring (Inner) */}
                              <circle
                                cx="120"
                                cy="120"
                                r="70"
                                fill="none"
                                stroke={curTheme.kirtGrad1}
                                strokeWidth="16"
                                strokeDasharray={`${(parseFloat(kirtSharePct) / 100) * 2 * Math.PI * 70} ${2 * Math.PI * 70}`}
                                strokeLinecap="round"
                                transform="rotate(-90 120 120)"
                              />

                              {/* Center Content: Marks & Total Mukbapath Count */}
                              <text x="120" y="98" textAnchor="middle" fontSize="26">🌸</text>
                              <text x="120" y="124" textAnchor="middle" fontSize="20" fontWeight="900" fill="#1e293b">
                                {graphTotalMarks.toFixed(1)} ગુણ
                              </text>
                              <text x="120" y="144" textAnchor="middle" fontSize="12.5" fontWeight="800" fill="#15803d">
                                કુલ {graphTotalCount} મુખપાઠ
                              </text>
                            </svg>
                          </div>

                          {/* Right: Comparative Breakdown Cards */}
                          <div style={{ flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ background: '#ffffff', borderRadius: '12px', padding: '16px', border: '1.5px solid #86efac' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <strong style={{ fontSize: '15px', color: '#15803d', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>📖</span> <span>વચનામૃત: {graphTotalVachMarks.toFixed(1)} ગુણ</span>
                                </strong>
                                <span style={{ fontSize: '18px', fontWeight: 900, color: '#15803d' }}>{vachSharePct}%</span>
                              </div>
                              <div style={{ background: '#e2e8f0', borderRadius: '8px', height: '12px', overflow: 'hidden' }}>
                                <div style={{ background: 'linear-gradient(90deg, #10b981, #047857)', width: `${vachSharePct}%`, height: '100%' }} />
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                                <span>કુલ એન્ટ્રીઓ: {graphTotalVachCount} મુખપાઠ</span>
                                <span>મેળવેલ ગુણ: {graphTotalVachMarks.toFixed(1)}</span>
                              </div>
                            </div>

                            <div style={{ background: '#ffffff', borderRadius: '12px', padding: '16px', border: '1.5px solid #93c5fd' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <strong style={{ fontSize: '15px', color: '#2563eb', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>🎵</span> <span>કીર્તન: {graphTotalKirtMarks.toFixed(1)} ગુણ</span>
                                </strong>
                                <span style={{ fontSize: '18px', fontWeight: 900, color: '#2563eb' }}>{kirtSharePct}%</span>
                              </div>
                              <div style={{ background: '#e2e8f0', borderRadius: '8px', height: '12px', overflow: 'hidden' }}>
                                <div style={{ background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)', width: `${kirtSharePct}%`, height: '100%' }} />
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                                <span>કુલ એન્ટ્રીઓ: {graphTotalKirtCount} મુખપાઠ</span>
                                <span>મેળવેલ ગુણ: {graphTotalKirtMarks.toFixed(1)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 5. DECORATIVE COMPARISON MATRIX TABLE (DISTINGUISHING MARKS VS COUNT) */}
                    <div style={{
                      background: '#ffffff',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '14px',
                      padding: '16px 18px',
                      marginBottom: '20px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                        <strong style={{ fontSize: '15px', color: '#1e3a5f', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>📋</span> <span>{t('આલેખ વિગતવાર ડેટા પત્રક (Distribution Matrix)', 'Data Matrix')}</span>
                        </strong>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          કુલ {totalItems} કક્ષા / કેટેગરી
                        </span>
                      </div>

                      <div className="table-responsive">
                        <table>
                          <thead>
                            <tr>
                              <th style={{ width: '45px' }}>{t('ક્રમ', 'No.')}</th>
                              <th>{barGraphView === 'marks' ? 'ગુણ કક્ષા (Marks Level)' : barGraphView === 'devotees' ? 'સાધકનું નામ' : 'ગ્રુપ લીડર'}</th>
                              <th style={{ textAlign: 'center', color: '#15803d' }}>📖 વચનામૃત ગુણ (સંખ્યા)</th>
                              <th style={{ textAlign: 'center', color: '#2563eb' }}>🎵 કીર્તન ગુણ (સંખ્યા)</th>
                              <th style={{ textAlign: 'center', color: '#b45309' }}>⭐ કુલ મુખપાઠ ગુણ</th>
                              <th style={{ textAlign: 'center', color: '#1e3a5f' }}>🎯 કુલ મુખપાઠ સંખ્યા</th>
                              <th style={{ minWidth: '150px' }}>વિઝ્યુઅલ ગુણોત્તર (Ratio Bar)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {graphItems.map((item, idx) => {
                              const isPeak = (item.totalMarks === peakItem.totalMarks && item.totalMarks > 0);
                              const itemTot = item.vachMarks + item.kirtMarks;
                              const vPct = itemTot > 0 ? (item.vachMarks / itemTot) * 100 : 50;

                              return (
                                <tr key={`tbl_${idx}`} style={{ background: isPeak ? '#fefce8' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc') }}>
                                  <td style={{ fontWeight: 800, color: isPeak ? '#b45309' : '#64748b' }}>
                                    {isPeak ? '⭐' : idx + 1}
                                  </td>
                                  <td style={{ fontWeight: 800, color: '#1e293b' }}>
                                    {item.name || item.labelSub || item.label}
                                    {isPeak && (
                                      <span style={{ marginLeft: '6px', fontSize: '10px', background: '#fef08a', color: '#854d0e', padding: '2px 6px', borderRadius: '4px', fontWeight: 900 }}>
                                        સર્વોચ્ચ શિખર
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'center', fontWeight: 800, color: '#15803d' }}>
                                    {item.vachMarks.toFixed(1)} ગુણ <span style={{ fontSize: '11px', color: '#64748b' }}>({item.vachCount} મુખપાઠ)</span>
                                  </td>
                                  <td style={{ textAlign: 'center', fontWeight: 800, color: '#2563eb' }}>
                                    {item.kirtMarks.toFixed(1)} ગુણ <span style={{ fontSize: '11px', color: '#64748b' }}>({item.kirtCount} મુખપાઠ)</span>
                                  </td>
                                  <td style={{ textAlign: 'center', fontWeight: 900, color: '#b45309', fontSize: '14px' }}>
                                    {item.totalMarks.toFixed(1)} ગુણ
                                  </td>
                                  <td style={{ textAlign: 'center', fontWeight: 900, color: '#1e3a5f', fontSize: '14px' }}>
                                    {item.totalCount} મુખપાઠ
                                  </td>
                                  <td>
                                    <div style={{ background: '#e2e8f0', borderRadius: '6px', height: '10px', overflow: 'hidden', display: 'flex' }}>
                                      <div style={{ background: '#10b981', width: `${vPct}%`, height: '100%' }} title={`વચનામૃત: ${item.vachMarks} ગુણ`} />
                                      <div style={{ background: '#3b82f6', width: `${100 - vPct}%`, height: '100%' }} title={`કીર્તન: ${item.kirtMarks} ગુણ`} />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 4 Bottom KPI Metric Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                      <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>
                          🟩 કુલ વચનામૃત મુખપાઠ
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#16a34a', marginTop: '4px' }}>
                          {totalVachEntries}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#15803d' }}>
                          લક્ષ્ય: {totalVachTarget} / સભ્ય
                        </div>
                      </div>

                      <div style={{ background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase' }}>
                          🟦 કુલ કીર્તન મુખપાઠ
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#2563eb', marginTop: '4px' }}>
                          {totalKirtEntries}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#1d4ed8' }}>
                          લક્ષ્ય: {totalKirtTarget} / સભ્ય
                        </div>
                      </div>

                      <div style={{ background: '#fefce8', border: '1.5px solid #fde047', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#a16207', textTransform: 'uppercase' }}>
                          ⭐ સરેરાશ મેળવેલ ગુણ
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#a16207', marginTop: '4px' }}>
                          {totalEntriesCount > 0 ? (totalMarksSum / totalEntriesCount).toFixed(1) : 0} / {maxMarks}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#854d0e' }}>
                          કુલ ગુણ સરવાળો: {totalMarksSum.toFixed(1)}
                        </div>
                      </div>

                      <div style={{ background: '#fdf4ff', border: '1.5px solid #f0abfc', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#86198f', textTransform: 'uppercase' }}>
                          🎯 મંડળ પૂર્ણતા દર
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#a21caf', marginTop: '4px' }}>
                          {mandalOverallPct}%
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#701a75' }}>
                          {activeDevoteesCount} સક્રિય સાધકો
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              // ================= SUB-TAB 2: INDIVIDUAL DEEP ANALYTICS =================
              if (summarySubTab === 'personal') {
                const currentPersonName = summarySelectedPerson || fGiver || (membersList[0] ? membersList[0].gu : '');
                const curData = peopleSummaryMap[currentPersonName] || {
                  name: currentPersonName,
                  role: 'MUKTO',
                  vach: 0,
                  kirtan: 0,
                  totalMarks: 0,
                  count: 0,
                  completedItems: []
                };

                const personalPct = Math.min(100, Math.round((curData.count / totalTarget) * 100));
                const vachPct = Math.min(100, Math.round((curData.vach / totalVachTarget) * 100));
                const kirtPct = Math.min(100, Math.round((curData.kirtan / totalKirtTarget) * 100));

                return (
                  <div>
                    {/* Devotee Selector Bar */}
                    <div style={{
                      background: '#f8fafc',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      marginBottom: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      flexWrap: 'wrap'
                    }}>
                      <label style={{ fontSize: '14px', fontWeight: 800, color: '#1e3a5f', whiteSpace: 'nowrap' }}>
                        👤 સાધક પસંદ કરો (Select Member):
                      </label>
                      <select
                        value={currentPersonName}
                        onChange={e => setSummarySelectedPerson(e.target.value)}
                        style={{
                          flex: 1,
                          minWidth: '240px',
                          padding: '9px 14px',
                          border: '2px solid #2563eb',
                          borderRadius: '8px',
                          fontSize: '14.5px',
                          fontWeight: 700,
                          color: '#1e293b',
                          background: '#ffffff'
                        }}
                      >
                        <optgroup label="-- સંતો (Swamis) --">
                          {swamisList.map((m, idx) => (
                            <option key={`swami_${idx}`} value={m.gu}>{m.gu}</option>
                          ))}
                        </optgroup>
                        <optgroup label="-- મુક્તો (Muktos) --">
                          {muktosList.map((m, idx) => (
                            <option key={`mukto_${idx}`} value={m.gu}>{m.gu}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    {/* Detailed Person Hero Card */}
                    <div style={{
                      background: '#ffffff',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '14px',
                      padding: '24px',
                      marginBottom: '20px',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.04)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ color: '#1e3a5f', fontSize: '24px', fontWeight: 900, margin: 0 }}>
                              {currentPersonName}
                            </h3>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 800,
                              background: curData.role === 'SWAMI' ? '#fff7ed' : '#eef2ff',
                              color: curData.role === 'SWAMI' ? '#c2410c' : '#4338ca'
                            }}>
                              {curData.role === 'SWAMI' ? 'સંત' : 'મુક્ત'}
                            </span>
                          </div>
                          <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                            વ્યક્તિગત મુખપાઠ સાધના વિશ્લેષણ
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '26px', fontWeight: 900, color: '#15803d' }}>
                            {curData.totalMarks.toFixed(1)} <span style={{ fontSize: '14px', fontWeight: 700 }}>ગુણ</span>
                          </div>
                          <div style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 700 }}>
                            {personalPct}% લક્ષ્ય પૂર્ણ
                          </div>
                        </div>
                      </div>

                      {/* Overall Progress Bar */}
                      <div style={{ background: '#e2e8f0', borderRadius: '12px', height: '16px', overflow: 'hidden', marginBottom: '20px' }}>
                        <div
                          style={{
                            background: 'linear-gradient(90deg, #1e3a5f, #2563eb, #10b981)',
                            width: `${personalPct}%`,
                            height: '100%',
                            borderRadius: '12px',
                            transition: 'width 0.4s ease'
                          }}
                        />
                      </div>

                      {/* 3 Metric Breakdown Cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                        <div style={{ background: '#fff7ed', border: '1.5px solid #fdba74', borderRadius: '10px', padding: '14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#c2410c' }}>📖 વચનામૃત પ્રગતિ</span>
                            <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#c2410c' }}>{vachPct}%</span>
                          </div>
                          <div style={{ fontSize: '20px', fontWeight: 900, color: '#c2410c', marginBottom: '8px' }}>
                            {curData.vach} / {totalVachTarget}
                          </div>
                          <div style={{ background: '#fed7aa', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
                            <div style={{ background: '#c2410c', width: `${vachPct}%`, height: '100%', transition: 'width 0.3s ease' }} />
                          </div>
                        </div>

                        <div style={{ background: '#eef2ff', border: '1.5px solid #a5b4fc', borderRadius: '10px', padding: '14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#4338ca' }}>🎵 કીર્તન પ્રગતિ</span>
                            <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#4338ca' }}>{kirtPct}%</span>
                          </div>
                          <div style={{ fontSize: '20px', fontWeight: 900, color: '#4338ca', marginBottom: '8px' }}>
                            {curData.kirtan} / {totalKirtTarget}
                          </div>
                          <div style={{ background: '#c7d2fe', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
                            <div style={{ background: '#4338ca', width: `${kirtPct}%`, height: '100%', transition: 'width 0.3s ease' }} />
                          </div>
                        </div>

                        <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '10px', padding: '14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>🎯 કુલ મુખપાઠ</span>
                            <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b' }}>{personalPct}%</span>
                          </div>
                          <div style={{ fontSize: '20px', fontWeight: 900, color: '#1e293b', marginBottom: '8px' }}>
                            {curData.count} / {totalTarget}
                          </div>
                          <div style={{ background: '#cbd5e1', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
                            <div style={{ background: '#1e293b', width: `${personalPct}%`, height: '100%', transition: 'width 0.3s ease' }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Completed Recitations Table */}
                    <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '18px' }}>
                      <h4 style={{ color: '#1e3a5f', fontSize: '16px', fontWeight: 800, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>📋</span> <span>{currentPersonName} દ્વારા આપેલ મુખપાઠની યાદી ({curData.completedItems.length})</span>
                      </h4>

                      {curData.completedItems.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '36px', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}>
                          આ સાધક માટે હજુ સુધી કોઈ મુખપાઠ એન્ટ્રી નોંધાયેલ નથી.
                          <div style={{ marginTop: '10px' }}>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => {
                                setFGiver(currentPersonName);
                                setActiveTab('entry');
                              }}
                            >
                              + આ સાધક માટે નવી એન્ટ્રી કરો
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="table-responsive">
                          <table style={{ fontSize: '12.5px' }}>
                            <thead>
                              <tr style={{ background: '#1c3d5a', color: '#ffffff' }}>
                                <th style={{ width: '40px', textAlign: 'center' }}>ક્રમ</th>
                                <th>તારીખ</th>
                                <th>પ્રકાર & નંબર</th>
                                <th>વિગત</th>
                                <th style={{ textAlign: 'center' }}>ગુણ</th>
                                <th>લેનાર સંત</th>
                                <th>નોંધ</th>
                              </tr>
                            </thead>
                            <tbody>
                              {curData.completedItems.map((e, idx) => (
                                <tr key={e.id || idx} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                                  <td>{e.date}</td>
                                  <td>
                                    <span style={{
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      fontWeight: 800,
                                      background: e.type === 'વચનામૃત' ? '#fff7ed' : '#eef2ff',
                                      color: e.type === 'વચનામૃત' ? '#c2410c' : '#4338ca'
                                    }}>
                                      {e.type} #{e.num}
                                    </span>
                                  </td>
                                  <td style={{ fontWeight: 600 }}>{e.title}</td>
                                  <td style={{ textAlign: 'center', fontWeight: 800, color: '#15803d' }}>{e.marks}</td>
                                  <td>{e.taker}</td>
                                  <td style={{ color: '#64748b' }}>{e.note || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // ================= SUB-TAB 3: STANDUP GROUPS COMPARISON =================
              if (summarySubTab === 'groups') {
                return (
                  <div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                      સ્ટેન્ડઅપ ગ્રુપ વાઈઝ કુલ ગુણ અને સરેરાશ પ્રગતિની તુલના
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                      {groupsList.map((g, gIdx) => {
                        const members = g.members || [];
                        let grpMarks = 0;
                        let grpCount = 0;
                        members.forEach(mName => {
                          const st = peopleSummaryMap[mName];
                          if (st) {
                            grpMarks += st.totalMarks;
                            grpCount += st.count;
                          }
                        });
                        const grpCapacity = members.length * totalTarget;
                        const grpPct = grpCapacity > 0 ? Math.min(100, Math.round((grpCount / grpCapacity) * 100)) : 0;
                        const grpAvgMarks = members.length > 0 ? (grpMarks / members.length).toFixed(1) : 0;

                        return (
                          <div
                            key={g.id || gIdx}
                            style={{
                              background: '#ffffff',
                              border: '1.5px solid #cbd5e1',
                              borderRadius: '12px',
                              padding: '18px',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <div>
                                <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                                  ગ્રુપ #{gIdx + 1}
                                </span>
                                <h3 style={{ color: '#1e3a5f', fontSize: '17px', fontWeight: 800, margin: '2px 0 0 0' }}>
                                  👑 {g.leader}
                                </h3>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '18px', fontWeight: 900, color: '#15803d' }}>
                                  {grpMarks.toFixed(1)} <span style={{ fontSize: '12px', fontWeight: 700 }}>ગુણ</span>
                                </div>
                                <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                                  સરેરાશ {grpAvgMarks} ગુણ/સભ્ય
                                </div>
                              </div>
                            </div>

                            {/* Group Progress Bar */}
                            <div style={{ background: '#e2e8f0', borderRadius: '8px', height: '10px', overflow: 'hidden', marginBottom: '12px' }}>
                              <div
                                style={{
                                  background: 'linear-gradient(90deg, #2563eb, #10b981)',
                                  width: `${grpPct}%`,
                                  height: '100%',
                                  transition: 'width 0.3s ease'
                                }}
                              />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                              <span>સભ્યો: {members.length}</span>
                              <span style={{ fontWeight: 800, color: '#1e293b' }}>{grpCount} મુખપાઠ ({grpPct}%)</span>
                            </div>

                            {/* Group Members List */}
                            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '8px' }}>
                                જૂથના સાધકો:
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {members.map((mName, mIdx) => {
                                  const mSt = peopleSummaryMap[mName] || { totalMarks: 0, count: 0 };
                                  const mPct = Math.min(100, Math.round((mSt.count / totalTarget) * 100));
                                  return (
                                    <div
                                      key={mIdx}
                                      style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '5px 8px',
                                        background: '#f8fafc',
                                        borderRadius: '6px',
                                        fontSize: '12.5px'
                                      }}
                                    >
                                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{mName}</span>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '11px', color: '#64748b' }}>{mSt.count} મુખપાઠ</span>
                                        <span style={{ fontWeight: 800, color: '#15803d', minWidth: '42px', textAlign: 'right' }}>
                                          {mSt.totalMarks.toFixed(1)}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              return null;
            })()}
          </div>
        )}

        {/* ================= DYNAMIC CUSTOM REPORT VIEW ================= */}
        {activeTab === 'custom_report' && (() => {
          const rep = customReportsList.find(r => r.id === activeCustomReportId) || customReportsList[0];
          if (!rep) {
            return (
              <div className="card" style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
                <div style={{ fontSize: '42px', marginBottom: '10px' }}>📑</div>
                <h3 style={{ color: '#1e3a5f' }}>{t('કોઈ કસ્ટમ રિપોર્ટ પસંદ કર્યો નથી', 'No Custom Report Selected')}</h3>
                <p>{t('કૃપા કરીને સાઇડબારમાંથી રિપોર્ટ પસંદ કરો અથવા એડમિન મેનેજરમાં નવો રિપોર્ટ બનાવો.', 'Please select a report from sidebar or create one in Admin Manager.')}</p>
              </div>
            );
          }

          // Apply all filters specified by the custom report
          const filtered = visibleEntries.filter(e => {
            // Flexible Date Filter
            if (custRepStartDate && e.date < custRepStartDate) return false;
            if (custRepEndDate && e.date > custRepEndDate) return false;

            // Type filter ('ALL' | 'વચનામૃત' | 'કીર્તન')
            if (rep.type && rep.type !== 'ALL' && rep.type !== 'all' && e.type !== rep.type) return false;

            // Category classification ('ALL' | 'ફરજિયાત' | 'વિશેષ')
            if (rep.classification && rep.classification !== 'ALL' && rep.classification !== 'all') {
              const list = e.type === 'વચનામૃત' ? vachanamrutsList : kirtansList;
              const found = list.find(x => x.num === e.num);
              if (found && found.type !== rep.classification) return false;
            }

            // Standup Group / Leader filter
            if (rep.leader && rep.leader !== 'ALL' && rep.leader !== 'all') {
              const grp = groupsList.find(g => g.leader === rep.leader || g.id === rep.leader);
              if (grp && grp.members && !grp.members.includes(e.giver)) return false;
            }

            // Min Marks Filter
            if (rep.minMarks && parseFloat(rep.minMarks) > 0) {
              const m = typeof e.marks === 'number' ? e.marks : (parseFloat(e.marks) || 0);
              if (m < parseFloat(rep.minMarks)) return false;
            }

            return true;
          });

          // Metrics
          const repTotalEntries = filtered.length;
          const repTotalMarks = filtered.reduce((acc, e) => acc + (typeof e.marks === 'number' ? e.marks : parseFloat(e.marks) || 0), 0);
          const repVachCount = filtered.filter(e => e.type === 'વચનામૃત').length;
          const repKirtCount = filtered.filter(e => e.type === 'કીર્તન').length;
          
          // Devotees aggregation
          const devoteeMap = {};
          filtered.forEach(e => {
            if (!devoteeMap[e.giver]) {
              devoteeMap[e.giver] = { name: e.giver, vach: 0, kirtan: 0, marks: 0, count: 0, items: [] };
            }
            if (e.type === 'વચનામૃત') devoteeMap[e.giver].vach++;
            else devoteeMap[e.giver].kirtan++;
            const m = typeof e.marks === 'number' ? e.marks : (parseFloat(e.marks) || 0);
            devoteeMap[e.giver].marks += m;
            devoteeMap[e.giver].count++;
            devoteeMap[e.giver].items.push(e);
          });
          const devoteeList = Object.values(devoteeMap).sort((a, b) => b.marks - a.marks);

          // Report Configuration (Selected Fields & Marks Scale)
          const allReportFields = getAllReportFields(rep.customFieldsMeta);
          const repFields = (rep.selectedFields && Array.isArray(rep.selectedFields) && rep.selectedFields.length > 0)
            ? rep.selectedFields
            : (rep.fieldCount === '5'
                ? ['sr', 'giver', 'type', 'title', 'marks']
                : ['sr', 'date', 'giver', 'taker', 'type', 'num', 'title', 'marks', 'maxMarks', 'note']);
          const currentScale = rep.marksScale || 5;

          // WhatsApp Share Text
          const handleShareWhatsapp = () => {
            let msg = `🌸 *SMVS મુખપાઠ વિશેષ રિપોર્ટ: ${rep.title}*\n`;
            if (rep.desc) msg += `_${rep.desc}_\n`;
            msg += `📌 સ્કેલ: ${currentScale} ગુણ પદ્ધતિ | કોલમ: ${repFields.length} ફિલ્ડ્સ\n`;
            if (custRepStartDate || custRepEndDate) {
              msg += `📅 સમયગાળો: ${custRepStartDate || 'શરૂઆતથી'} થી ${custRepEndDate || 'આજ સુધી'}\n`;
            }
            msg += `\n📊 *રિપોર્ટ સારાંશ:*\n`;
            msg += `• કુલ સક્રિય સાધકો: ${devoteeList.length}\n`;
            msg += `• કુલ મુખપાઠ એન્ટ્રી: ${repTotalEntries} (વચનામૃત: ${repVachCount}, કીર્તન: ${repKirtCount})\n`;
            msg += `• કુલ મેળવેલ ગુણ: ${repTotalMarks.toFixed(1)} / (સ્કેલ: ${currentScale})\n`;
            msg += `• સરેરાશ ગુણ: ${repTotalEntries > 0 ? (repTotalMarks / repTotalEntries).toFixed(1) : 0}\n\n`;
            msg += `🏆 *ટોપ સાધકોની યાદી:*\n`;
            devoteeList.slice(0, 10).forEach((d, idx) => {
              msg += `${idx + 1}. *${d.name}* - ${d.marks.toFixed(1)} ગુણ (${d.count} મુખપાઠ: ${d.vach} વચ., ${d.kirtan} કી.)\n`;
            });
            msg += `\n॥ જય સ્વામિનારાયણ ॥`;
            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
          };

          // CSV Export matching selected report fields dynamically (including any custom fields)
          const handleExportCSV = () => {
            const headers = repFields.map(fid => {
              const fObj = allReportFields.find(x => x.id === fid);
              return fObj ? (language === 'gu' ? fObj.labelGu : fObj.labelEn) : fid;
            });
            let csv = headers.map(h => `"${h}"`).join(',') + '\n';
            filtered.forEach((e, idx) => {
              const row = repFields.map(fid => {
                let val = '';
                if (fid === 'sr') val = `${idx + 1}`;
                else if (fid === 'date') val = e.date || '';
                else if (fid === 'giver') val = e.giver || '';
                else if (fid === 'taker') val = e.taker || '';
                else if (fid === 'type') val = e.type || '';
                else if (fid === 'num') val = `${e.num || ''}`;
                else if (fid === 'title') val = (e.title || '').replace(/"/g, '""');
                else if (fid === 'marks') val = `${e.marks ?? ''}`;
                else if (fid === 'maxMarks') val = `${currentScale}`;
                else if (fid === 'note') val = (e.note || '').replace(/"/g, '""');
                else {
                  // Custom field value or default
                  const fObj = allReportFields.find(x => x.id === fid);
                  val = (e[fid] || (fObj ? fObj.defaultVal : '') || '-').toString().replace(/"/g, '""');
                }
                return `"${val}"`;
              });
              csv += row.join(',') + '\n';
            });
            const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `${rep.title}_Report_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          };

          return (
            <div className="card">
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', marginBottom: '18px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h2 style={{ color: '#1e3a5f', fontSize: '22px', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>📑</span> <span>{rep.title}</span>
                    </h2>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 800,
                      background: rep.access === 'mukto' ? '#dcfce7' : '#fef3c7',
                      color: rep.access === 'mukto' ? '#15803d' : '#b45309',
                      border: rep.access === 'mukto' ? '1px solid #86efac' : '1px solid #fde68a'
                    }}>
                      {rep.access === 'mukto' ? '👥 મુક્તો માટે સક્રિય' : '👑 માત્ર એડમિન'}
                    </span>
                  </div>
                  {rep.desc && (
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                      {rep.desc}
                    </div>
                  )}
                  {/* Applied Filters Badges */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                    <span style={{ fontSize: '11px', background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: '4px', fontWeight: 800, border: '1px solid #bfdbfe' }}>
                      📋 {repFields.length} {t('ફિલ્ડ્સ / કોલમ', 'Fields / Columns')}
                    </span>
                    <span style={{ fontSize: '11px', background: '#f0fdf4', color: '#15803d', padding: '2px 8px', borderRadius: '4px', fontWeight: 800, border: '1px solid #bbf7d0' }}>
                      ⭐ સ્કેલ: {currentScale} {t('ગુણ', 'Marks')}
                    </span>
                    <span style={{ fontSize: '11px', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                      પ્રકાર: {rep.type || 'તમામ'}
                    </span>
                    <span style={{ fontSize: '11px', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                      કેટેગરી: {rep.classification || 'તમામ'}
                    </span>
                    {rep.leader && rep.leader !== 'ALL' && (
                      <span style={{ fontSize: '11px', background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                        👑 લીડર: {rep.leader}
                      </span>
                    )}
                    {rep.minMarks > 0 && (
                      <span style={{ fontSize: '11px', background: '#f0fdf4', color: '#15803d', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                        ⭐ ન્યૂનતમ {rep.minMarks} ગુણ
                      </span>
                    )}
                  </div>
                </div>

                {/* Top Action Buttons */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()} style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span>🖨️</span> <span>{t('પ્રિન્ટ', 'Print')}</span>
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={handleExportCSV} style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span>📥</span> <span>{t('CSV એક્સપોર્ટ', 'Export CSV')}</span>
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleShareWhatsapp} style={{ background: '#22c55e', borderColor: '#16a34a', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span>📲</span> <span>{t('WhatsApp શેર', 'Share WhatsApp')}</span>
                  </button>
                </div>
              </div>

              {/* Flexible Date Range Selector */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: '10px',
                padding: '12px 16px',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '13px', color: '#1e293b' }}>📅 {t('સમયગાળો (Date Range):', 'Date Range:')}</strong>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>{t('થી:', 'From:')}</span>
                    <input
                      type="date"
                      value={custRepStartDate}
                      onChange={e => setCustRepStartDate(e.target.value)}
                      style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>{t('સુધી:', 'To:')}</span>
                    <input
                      type="date"
                      value={custRepEndDate}
                      onChange={e => setCustRepEndDate(e.target.value)}
                      style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                    />
                  </div>
                </div>

                {/* Quick Date Presets */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                    onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setCustRepStartDate(today);
                      setCustRepEndDate(today);
                    }}
                  >
                    {t('આજે', 'Today')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                    onClick={() => {
                      const end = new Date().toISOString().split('T')[0];
                      const start = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
                      setCustRepStartDate(start);
                      setCustRepEndDate(end);
                    }}
                  >
                    {t('છેલ્લા 7 દિવસ', 'Last 7 Days')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                    onClick={() => {
                      const now = new Date();
                      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
                      setCustRepStartDate(start);
                      setCustRepEndDate(end);
                    }}
                  >
                    {t('આ મહિને', 'This Month')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                    onClick={() => {
                      setCustRepStartDate('');
                      setCustRepEndDate('');
                    }}
                  >
                    {t('તમામ સમય', 'All Time')}
                  </button>
                </div>
              </div>

              {/* 4 KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>સક્રિય સાધકો</div>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#1e3a5f', marginTop: '4px' }}>{devoteeList.length}</div>
                  <div style={{ fontSize: '11.5px', color: '#16a34a', fontWeight: 700 }}>ભાગ લેનાર સભ્યો</div>
                </div>

                <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#c2410c', textTransform: 'uppercase' }}>કુલ મુખપાઠ એન્ટ્રી</div>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#c2410c', marginTop: '4px' }}>{repTotalEntries}</div>
                  <div style={{ fontSize: '11.5px', color: '#9a3412' }}>વચ: {repVachCount} • કી: {repKirtCount}</div>
                </div>

                <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#15803d', textTransform: 'uppercase' }}>કુલ મેળવેલ ગુણ</div>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#15803d', marginTop: '4px' }}>{repTotalMarks.toFixed(1)}</div>
                  <div style={{ fontSize: '11.5px', color: '#166534' }}>સ્કેલ: {currentScale} ગુણ મુજબ</div>
                </div>

                <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase' }}>સરેરાશ ગુણ</div>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#1e40af', marginTop: '4px' }}>
                    {repTotalEntries > 0 ? (repTotalMarks / repTotalEntries).toFixed(1) : 0}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#1d4ed8' }}>પ્રતિ મુખપાઠ સરેરાશ</div>
                </div>
              </div>

              {/* View Switcher: Detailed Table (selected 5 or 10 fields) vs Devotee Summary */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setCustReportTableView('details')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontWeight: 800,
                      fontSize: '13px',
                      cursor: 'pointer',
                      border: custReportTableView === 'details' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: custReportTableView === 'details' ? '#eff6ff' : '#ffffff',
                      color: custReportTableView === 'details' ? '#1d4ed8' : '#475569'
                    }}
                  >
                    📋 {t(`વિસ્તૃત એન્ટ્રી પત્રક (${repFields.length} ફિલ્ડ્સ)`, `Detailed Records (${repFields.length} Fields)`)} ({repTotalEntries})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustReportTableView('summary')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontWeight: 800,
                      fontSize: '13px',
                      cursor: 'pointer',
                      border: custReportTableView === 'summary' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: custReportTableView === 'summary' ? '#eff6ff' : '#ffffff',
                      color: custReportTableView === 'summary' ? '#1d4ed8' : '#475569'
                    }}
                  >
                    👥 {t('સાધકવાર સમરી પત્રક', 'Devotee Summary')} ({devoteeList.length})
                  </button>
                </div>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  {custReportTableView === 'details'
                    ? `કુલ ${repTotalEntries} મુખપાઠ રેકોર્ડ્સ (${repFields.length} કોલમ)`
                    : `કુલ ${devoteeList.length} સક્રિય સાધકો`}
                </span>
              </div>

              {/* VIEW 1: Detailed Dynamic Table matching exactly the selected fields (including custom fields) */}
              {custReportTableView === 'details' && (
                <div style={{ marginBottom: '16px' }}>
                  <div className="table-responsive">
                    <table>
                      <thead>
                        <tr>
                          {repFields.map(fid => {
                            const fObj = allReportFields.find(x => x.id === fid);
                            return (
                              <th key={fid} style={{ textAlign: ['sr', 'date', 'num', 'marks', 'maxMarks'].includes(fid) ? 'center' : 'left' }}>
                                {fObj ? (language === 'gu' ? fObj.labelGu : fObj.labelEn) : fid}
                                {fObj && fObj.isCustom && <span style={{ marginLeft: '4px', fontSize: '10px', color: '#b45309' }}>✨</span>}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 ? (
                          <tr>
                            <td colSpan={repFields.length} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                              {t('પસંદ કરેલા ફિલ્ટર્સ મુજબ કોઈ રેકોર્ડ્સ મળ્યા નથી.', 'No records matching report filters.')}
                            </td>
                          </tr>
                        ) : (
                          filtered.map((e, idx) => (
                            <tr key={e.id || idx} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                              {repFields.map(fid => {
                                if (fid === 'sr') {
                                  return <td key={fid} style={{ textAlign: 'center', fontWeight: 800, color: '#64748b' }}>{idx + 1}</td>;
                                }
                                if (fid === 'date') {
                                  return <td key={fid} style={{ textAlign: 'center', fontSize: '12px', whiteSpace: 'nowrap' }}>{e.date}</td>;
                                }
                                if (fid === 'giver') {
                                  return <td key={fid} style={{ fontWeight: 800, color: '#1e3a5f' }}>{e.giver}</td>;
                                }
                                if (fid === 'taker') {
                                  return <td key={fid} style={{ color: '#475569' }}>{e.taker}</td>;
                                }
                                if (fid === 'type') {
                                  const isVach = e.type === 'વચનામૃત';
                                  return (
                                    <td key={fid} style={{ textAlign: 'center' }}>
                                      <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '11.5px',
                                        fontWeight: 800,
                                        background: isVach ? '#ffedd5' : '#e0e7ff',
                                        color: isVach ? '#c2410c' : '#4338ca'
                                      }}>
                                        {e.type}
                                      </span>
                                    </td>
                                  );
                                }
                                if (fid === 'num') {
                                  return <td key={fid} style={{ textAlign: 'center', fontWeight: 700 }}>#{e.num}</td>;
                                }
                                if (fid === 'title') {
                                  return <td key={fid} style={{ fontWeight: 600 }}>{e.title}</td>;
                                }
                                if (fid === 'marks') {
                                  return (
                                    <td key={fid} style={{ textAlign: 'center', fontWeight: 900, color: '#15803d' }}>
                                      {e.marks}
                                    </td>
                                  );
                                }
                                if (fid === 'maxMarks') {
                                  return (
                                    <td key={fid} style={{ textAlign: 'center', color: '#64748b', fontWeight: 700 }}>
                                      {currentScale}
                                    </td>
                                  );
                                }
                                if (fid === 'note') {
                                  return <td key={fid} style={{ fontSize: '12px', color: '#64748b' }}>{e.note || '-'}</td>;
                                }
                                // Render Custom Field Cell
                                const fObj = allReportFields.find(x => x.id === fid);
                                const customVal = e[fid] || (fObj ? fObj.defaultVal : '') || (fObj && (fObj.labelGu.includes('સહી') || fObj.labelGu.includes('Sign')) ? '✍️ [ ________ ]' : '-');
                                return (
                                  <td key={fid} style={{ textAlign: 'center', color: '#334155', fontSize: '12.5px', fontWeight: 600 }}>
                                    {customVal}
                                  </td>
                                );
                              })}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* VIEW 2: Devotees Summary Table */}
              {custReportTableView === 'summary' && (
                <div style={{ marginBottom: '16px' }}>
                  <div className="table-responsive">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: '50px' }}>{t('ક્રમ', 'No.')}</th>
                          <th>{t('સાધક ભક્તનું નામ', 'Devotee Name')}</th>
                          <th style={{ textAlign: 'center' }}>{t('વચનામૃત', 'Vachanamrut')}</th>
                          <th style={{ textAlign: 'center' }}>{t('કીર્તન', 'Kirtan')}</th>
                          <th style={{ textAlign: 'center' }}>{t('કુલ મુખપાઠ', 'Total')}</th>
                          <th style={{ textAlign: 'center' }}>{t('કુલ ગુણ', 'Total Marks')}</th>
                          <th style={{ textAlign: 'center' }}>{t('સરેરાશ ગુણ', 'Avg Marks')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {devoteeList.length === 0 ? (
                          <tr>
                            <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                              {t('પસંદ કરેલા ફિલ્ટર્સ મુજબ કોઈ રેકોર્ડ્સ મળ્યા નથી.', 'No records matching report filters.')}
                            </td>
                          </tr>
                        ) : (
                          devoteeList.map((d, idx) => (
                            <tr key={d.name} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                              <td style={{ fontWeight: 800, color: '#64748b' }}>{idx + 1}</td>
                              <td style={{ fontWeight: 800, color: '#1e3a5f' }}>
                                {d.name}
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 700, color: '#c2410c' }}>
                                {d.vach}
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 700, color: '#4338ca' }}>
                                {d.kirtan}
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 800 }}>
                                {d.count}
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 900, color: '#15803d' }}>
                                {d.marks.toFixed(1)}
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 800, color: '#0369a1' }}>
                                {d.count > 0 ? (d.marks / d.count).toFixed(1) : 0}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ================= TAB 6: MASTER ADMIN SETTINGS & FULL CRUD ================= */}
        {activeTab === 'admin' && role === 'main' && (
          <div className="card" style={{ border: '2px solid #2563eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
              <div>
                <h2 style={{ color: '#1d4ed8', fontSize: '20px', fontWeight: 900, margin: 0 }}>
                  ⚙️ {t('માસ્ટર એડમિન મેનેજર', 'Master Admin Manager')}
                </h2>
                <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '3px' }}>
                  {t('સંપૂર્ણ સંસ્થાકીય ડેટાબેઝ, મુખપાઠ યાદી, સભ્યો અને બ્રાન્ડિંગ નિયંત્રણ', 'Comprehensive database, mukhpath records, members and branding control')}
                </div>
              </div>

              <button type="button" className="btn btn-ghost btn-sm" onClick={handleForceSeed}>
                🌱 {t('Firebase રી-સીડ (Default Seeding)', 'Re-Seed Collections')}
              </button>
            </div>

            {/* Sub Tabs Bar */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderBottom: '2px solid var(--line)', paddingBottom: '12px', marginBottom: '18px' }}>
              <button 
                type="button" 
                className={`btn btn-sm ${adminSubTab === 'vach' ? 'btn-vach' : 'btn-ghost'}`}
                onClick={() => setAdminSubTab('vach')}
              >
                📘 {t('વચનામૃત CRUD', 'Vachanamruts')} ({vachanamrutsList.length})
              </button>

              <button 
                type="button" 
                className={`btn btn-sm ${adminSubTab === 'kirtan' ? 'btn-kirtan' : 'btn-ghost'}`}
                onClick={() => setAdminSubTab('kirtan')}
              >
                📙 {t('કીર્તન CRUD', 'Kirtans')} ({kirtansList.length})
              </button>

              <button 
                type="button" 
                className={`btn btn-sm ${adminSubTab === 'members' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setAdminSubTab('members')}
              >
                👥 {t('સભ્યો / ભક્તો CRUD', 'Members')} ({membersList.length})
              </button>

              <button 
                type="button" 
                className={`btn btn-sm ${adminSubTab === 'groups' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setAdminSubTab('groups')}
              >
                👥 {t('ગ્રુપ & લીડર મેનેજમેન્ટ', 'Groups & Leaders')} ({groupsList.length})
              </button>

              <button 
                type="button" 
                className={`btn btn-sm ${adminSubTab === 'reports' ? 'btn-vach' : 'btn-ghost'}`}
                onClick={() => setAdminSubTab('reports')}
              >
                📑 {t('કસ્ટમ રિપોર્ટ્સ બિલ્ડર', 'Custom Reports')} ({customReportsList.length})
              </button>

              <button 
                type="button" 
                className={`btn btn-sm ${adminSubTab === 'branding' ? 'btn-gold' : 'btn-ghost'}`}
                onClick={() => setAdminSubTab('branding')}
              >
                🎨 {t('બ્રાન્ડિંગ & કલર થીમ', 'Branding & Theme')}
              </button>

              <button 
                type="button" 
                className={`btn btn-sm ${adminSubTab === 'security' ? 'btn-gold' : 'btn-ghost'}`}
                onClick={() => setAdminSubTab('security')}
              >
                🔑 {t('પોર્ટલ પિન & સિક્યુરિટી', 'Portal PIN & Security')}
              </button>
            </div>

            {/* SUB-SECTION 1: VACHANAMRUT CRUD */}
            {adminSubTab === 'vach' && (
              <>
                <div style={{ background: '#fff7ed', border: '1.5px solid #fdba74', padding: '18px', borderRadius: '12px', marginBottom: '20px' }}>
                  <h3 style={{ color: '#c2410c', fontSize: '16px', marginBottom: '12px', fontWeight: 800 }}>
                    {editingVachNum !== null ? `✏️ વચનામૃત ${editingVachNum} એડિટ કરો (Firebase: vach_${editingVachNum})` : '➕ નવું વચનામૃત ઉમેરો (Firebase: vachanamruts Collection)'}
                  </h3>
                  <div className="grid-3" style={{ marginBottom: '12px' }}>
                    <div>
                      <label>વચનામૃત નંબર (Number) <span className="req">*</span></label>
                      <input 
                        type="number" 
                        placeholder="દા.ત. 48" 
                        value={vachNum} 
                        onChange={e => setVachNum(e.target.value)} 
                        disabled={editingVachNum !== null}
                      />
                    </div>
                    <div>
                      <label>પ્રકરણ (Section) <span className="req">*</span></label>
                      <input 
                        type="text" 
                        placeholder="દા.ત. ગઢડા પ્રથમ, વડતાલ, સારંગપુર..." 
                        value={vachSec} 
                        onChange={e => setVachSec(e.target.value)} 
                      />
                    </div>
                    <div>
                      <label>પ્રકાર (Type) <span className="req">*</span></label>
                      <select value={vachType} onChange={e => setVachType(e.target.value)}>
                        <option value="ફરજિયાત">ફરજિયાત (Mandatory)</option>
                        <option value="વિશેષ">વિશેષ (Special)</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label>શીર્ષક / ટાઇટલ / વિગત (Title) <span className="req">*</span></label>
                    <input 
                      type="text" 
                      placeholder="દા.ત. ભગવાનની મૂર્તિ અંતર્દ્રષ્ટિએ જોવાનું..." 
                      value={vachTitle} 
                      onChange={e => setVachTitle(e.target.value)} 
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" className="btn btn-vach" onClick={handleSaveVachanamrut}>
                      💾 {editingVachNum !== null ? 'વચનામૃત Firebase માં અપડેટ કરો' : 'વચનામૃત Firebase માં સેવ કરો'}
                    </button>
                    {editingVachNum !== null && (
                      <button type="button" className="btn btn-ghost" onClick={() => { setEditingVachNum(null); setVachNum(''); setVachTitle(''); }}>
                        રદ કરો (Cancel)
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                  <h3 style={{ color: 'var(--vach-color)', fontSize: '16px', fontWeight: 800 }}>📘 `vachanamruts` Collection ({vachanamrutsList.length})</h3>
                  <input type="text" placeholder="વચનામૃત શોધો..." value={vachSearch} onChange={e => setVachSearch(e.target.value)} style={{ width: '220px' }} />
                </div>

                <div className="table-responsive" style={{ maxHeight: '400px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '60px' }}>નંબર</th>
                        <th>પ્રકરણ</th>
                        <th>શીર્ષક / વિગત</th>
                        <th>પ્રકાર</th>
                        <th style={{ width: '130px' }}>ક્રિયા</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vachanamrutsList
                        .filter(v => {
                          if (!vachSearch.trim()) return true;
                          const q = vachSearch.toLowerCase();
                          return v.title.toLowerCase().includes(q) || v.sec.toLowerCase().includes(q) || v.num.toString().includes(q);
                        })
                        .map(item => (
                          <tr key={item.num}>
                            <td style={{ fontWeight: 800, color: 'var(--vach-color)' }}>{item.num}</td>
                            <td style={{ fontWeight: 700 }}>{item.sec}</td>
                            <td>{item.title}</td>
                            <td>
                              <span style={{
                                padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 800,
                                background: item.type === 'ફરજિયાત' ? '#fff7ed' : '#f0fdf4',
                                color: item.type === 'ફરજિયાત' ? '#c2410c' : '#15803d'
                              }}>
                                {item.type}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleEditVachanamrut(item)} style={{ padding: '2px 8px', fontSize: '11px' }}>
                                  ✏️ એડિટ
                                </button>
                                <button type="button" className="btn btn-red btn-sm" onClick={() => handleDeleteVachanamrut(item.num)} style={{ padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <TrashIcon size={13} /> <span>ડિલીટ</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* SUB-SECTION 2: KIRTAN CRUD */}
            {adminSubTab === 'kirtan' && (
              <>
                <div style={{ background: '#eef2ff', border: '1.5px solid #a5b4fc', padding: '18px', borderRadius: '12px', marginBottom: '20px' }}>
                  <h3 style={{ color: '#4338ca', fontSize: '16px', marginBottom: '12px', fontWeight: 800 }}>
                    {editingKirtanNum !== null ? `✏️ કીર્તન ${editingKirtanNum} એડિટ કરો (Firebase: kirtan_${editingKirtanNum})` : '➕ નવું કીર્તન ઉમેરો (Firebase: kirtans Collection)'}
                  </h3>
                  <div className="grid-3" style={{ marginBottom: '12px' }}>
                    <div>
                      <label>કીર્તન નંબર (Number) <span className="req">*</span></label>
                      <input 
                        type="number" 
                        placeholder="દા.ત. 40" 
                        value={kirtanNum} 
                        onChange={e => setKirtanNum(e.target.value)} 
                        disabled={editingKirtanNum !== null}
                      />
                    </div>
                    <div>
                      <label>વિભાગ / કેટેગરી <span className="req">*</span></label>
                      <input 
                        type="text" 
                        placeholder="દા.ત. નિત્યક્રમ, પ્રાર્થના, ઉપદેશનાં પદો..." 
                        value={kirtanSec} 
                        onChange={e => setKirtanSec(e.target.value)} 
                      />
                    </div>
                    <div>
                      <label>પ્રકાર (Type) <span className="req">*</span></label>
                      <select value={kirtanType} onChange={e => setKirtanType(e.target.value)}>
                        <option value="ફરજિયાત">ફરજિયાત (Mandatory)</option>
                        <option value="વિશેષ">વિશેષ (Special)</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label>કીર્તનની પ્રથમ પંક્તિ / શીર્ષક <span className="req">*</span></label>
                    <input 
                      type="text" 
                      placeholder="દા.ત. વંદુ શ્રીહરિ પદ સદા..." 
                      value={kirtanTitle} 
                      onChange={e => setKirtanTitle(e.target.value)} 
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" className="btn btn-kirtan" onClick={handleSaveKirtan}>
                      💾 {editingKirtanNum !== null ? 'કીર્તન Firebase માં અપડેટ કરો' : 'કીર્તન Firebase માં સેવ કરો'}
                    </button>
                    {editingKirtanNum !== null && (
                      <button type="button" className="btn btn-ghost" onClick={() => { setEditingKirtanNum(null); setKirtanNum(''); setKirtanTitle(''); }}>
                        રદ કરો (Cancel)
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                  <h3 style={{ color: 'var(--kirtan-color)', fontSize: '16px', fontWeight: 800 }}>📙 `kirtans` Collection ({kirtansList.length})</h3>
                  <input type="text" placeholder="કીર્તન શોધો..." value={kirtanSearch} onChange={e => setKirtanSearch(e.target.value)} style={{ width: '220px' }} />
                </div>

                <div className="table-responsive" style={{ maxHeight: '400px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '60px' }}>નંબર</th>
                        <th>વિભાગ</th>
                        <th>પ્રથમ પંક્તિ / શીર્ષક</th>
                        <th>પ્રકાર</th>
                        <th style={{ width: '130px' }}>ક્રિયા</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kirtansList
                        .filter(k => {
                          if (!kirtanSearch.trim()) return true;
                          const q = kirtanSearch.toLowerCase();
                          return k.title.toLowerCase().includes(q) || k.sec.toLowerCase().includes(q) || k.num.toString().includes(q);
                        })
                        .map(item => (
                          <tr key={item.num}>
                            <td style={{ fontWeight: 800, color: 'var(--kirtan-color)' }}>{item.num}</td>
                            <td style={{ fontWeight: 700 }}>{item.sec}</td>
                            <td>{item.title}</td>
                            <td>
                              <span style={{
                                padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 800,
                                background: item.type === 'ફરજિયાત' ? '#eef2ff' : '#f0fdf4',
                                color: item.type === 'ફરજિયાત' ? '#4338ca' : '#15803d'
                              }}>
                                {item.type}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleEditKirtan(item)} style={{ padding: '2px 8px', fontSize: '11px' }}>
                                  ✏️ એડિટ
                                </button>
                                <button type="button" className="btn btn-red btn-sm" onClick={() => handleDeleteKirtan(item.num)} style={{ padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <TrashIcon size={13} /> <span>ડિલીટ</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* SUB-SECTION 3: MEMBERS CRUD */}
            {adminSubTab === 'members' && (
              <>
                <div style={{ background: '#fffbeb', border: '1.5px solid #fef08a', padding: '18px', borderRadius: '12px', marginBottom: '20px' }}>
                  <h3 style={{ color: '#854d0e', fontSize: '16px', marginBottom: '12px', fontWeight: 800 }}>➕ નવો ભક્ત / પૂજ્ય સંત ઉમેરો (Firebase: members Collection)</h3>
                  <div className="grid-3" style={{ marginBottom: '12px' }}>
                    <div>
                      <label>ગુજરાતી નામ *</label>
                      <input type="text" placeholder="દા.ત. આનંદ મહારાજ" value={admNewGu} onChange={e => setAdmNewGu(e.target.value)} />
                    </div>
                    <div>
                      <label>English Name</label>
                      <input type="text" placeholder="e.g. Anand Maharaj" value={admNewEn} onChange={e => setAdmNewEn(e.target.value)} />
                    </div>
                    <div>
                      <label>પ્રકાર (Role)</label>
                      <select value={admNewRole} onChange={e => setAdmNewRole(e.target.value)}>
                        <option value="MUKTO">મુક્ત (Devotee)</option>
                        <option value="SWAMI">પૂજ્ય સંત (Swami)</option>
                      </select>
                    </div>
                  </div>
                  <button type="button" className="btn btn-gold" onClick={handleAddNewMember}>
                    ➕ સભ્ય Firebase Collection માં સેવ કરો
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                  <h3 style={{ color: 'var(--primary)', fontSize: '16px', fontWeight: 800 }}>👥 `members` Collection ({membersList.length})</h3>
                  <input type="text" placeholder="નામ શોધો..." value={admMemberSearch} onChange={e => setAdmMemberSearch(e.target.value)} style={{ width: '220px' }} />
                </div>

                <div className="table-responsive" style={{ maxHeight: '350px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>પ્રકાર</th>
                        <th>ગુજરાતી નામ</th>
                        <th>English Name</th>
                        <th style={{ width: '90px' }}>ક્રિયા</th>
                      </tr>
                    </thead>
                    <tbody>
                      {membersList
                        .filter(item => {
                          if (!admMemberSearch.trim()) return true;
                          const q = admMemberSearch.toLowerCase();
                          return item.gu.toLowerCase().includes(q) || (item.en && item.en.toLowerCase().includes(q));
                        })
                        .map((item, idx) => (
                          <tr key={item.id || idx}>
                            <td>
                              <span style={{
                                padding: '2px 6px', borderRadius: '4px', fontWeight: 800, fontSize: '11px',
                                background: item.role === 'SWAMI' ? '#fff7ed' : '#eef2ff',
                                color: item.role === 'SWAMI' ? '#c2410c' : '#4338ca'
                              }}>
                                {item.role === 'SWAMI' ? 'પૂજ્ય સંત' : 'મુક્ત'}
                              </span>
                            </td>
                            <td style={{ fontWeight: 700 }}>{item.gu}</td>
                            <td style={{ color: '#64748b' }}>{item.en}</td>
                            <td>
                              <button type="button" className="btn btn-red btn-sm" onClick={() => handleDeleteMember(item.id, item.gu)} style={{ padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <TrashIcon size={13} /> <span>ડિલીટ</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* SUB-SECTION: STANDUP GROUPS CRUD */}
            {adminSubTab === 'groups' && (
              <>
                {/* Create / Edit Group Box */}
                <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', padding: '18px', borderRadius: '12px', marginBottom: '20px' }}>
                  <h3 style={{ color: '#166534', fontSize: '16px', marginBottom: '12px', fontWeight: 800 }}>
                    {editingGroupId ? `✏️ ગ્રુપ એડિટ કરો (Firebase: groups Collection)` : `➕ નવું સ્ટેન્ડ-અપ ગ્રુપ ઉમેરો (Firebase: groups Collection)`}
                  </h3>
                  <div className="grid-2" style={{ marginBottom: '12px' }}>
                    <div>
                      <label>👑 {t('ગ્રુપ લીડર પસંદ કરો (Group Leader)', 'Group Leader')} <span className="req">*</span></label>
                      <select
                        value={grpLeaderInput}
                        onChange={e => {
                          setGrpLeaderInput(e.target.value);
                          if (!grpNameInput) setGrpNameInput(`${e.target.value} ગ્રૂપ`);
                        }}
                      >
                        <option value="">-- લીડર પસંદ કરો --</option>
                        {membersList.map(m => (
                          <option key={m.gu} value={m.gu}>
                            {m.gu} ({m.role === 'SWAMI' ? 'સંત' : 'મુક્ત'})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>🏷️ {t('ગ્રુપનું નામ (Group Name)', 'Group Name')}</label>
                      <input
                        type="text"
                        placeholder="દા.ત. અક્ષર ગ્રૂપ / સુખમ મહારાજ ગ્રૂપ"
                        value={grpNameInput}
                        onChange={e => setGrpNameInput(e.target.value)}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" className="btn btn-primary" onClick={handleSaveGroup} style={{ fontWeight: 800 }}>
                      💾 {editingGroupId ? t('ગ્રુપ અપડેટ કરો', 'Update Group') : t('ગ્રુપ Firebase માં સેવ કરો', 'Save Group to Firebase')}
                    </button>
                    {editingGroupId && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          setEditingGroupId(null);
                          setGrpNameInput('');
                          setGrpLeaderInput('');
                        }}
                      >
                        {t('રદ કરો', 'Cancel')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Groups List */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                  <h3 style={{ color: '#166534', fontSize: '16px', fontWeight: 800 }}>
                    👥 `groups` Collection ({groupsList.length} ગ્રુપ)
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    {t('લીડર બદલો, નવા સભ્યો ઉમેરો અથવા હટાવો. તમામ ફેરફારો Firebase Cloud માં તુરંત સેવ થશે.', 'Change leaders, add or remove members in real-time.')}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                  {groupsList.map((g, gIdx) => {
                    const members = g.members || [];
                    const availableMembers = membersList.filter(m => !members.includes(m.gu));

                    return (
                      <div
                        key={g.id || gIdx}
                        style={{
                          background: '#ffffff',
                          border: '1.5px solid #cbd5e1',
                          borderRadius: '12px',
                          padding: '16px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                        }}
                      >
                        {/* Group Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                              ગ્રુપ #{gIdx + 1}
                            </span>
                            <h4 style={{ color: '#1e3a5f', fontSize: '16px', fontWeight: 800, margin: '2px 0 0 0' }}>
                              👑 {g.leader} {g.name && g.name !== `${g.leader} ગ્રૂપ` ? `(${g.name})` : ''}
                            </h4>
                            <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 700 }}>
                              {members.length} સભ્યો
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                setEditingGroupId(g.id);
                                setGrpLeaderInput(g.leader);
                                setGrpNameInput(g.name || `${g.leader} ગ્રૂપ`);
                                window.scrollTo({ top: 400, behavior: 'smooth' });
                              }}
                              style={{ padding: '2px 8px', fontSize: '11px' }}
                            >
                              ✏️ એડિટ
                            </button>
                            <button
                              type="button"
                              className="btn btn-red btn-sm"
                              onClick={() => handleDeleteGroup(g.id, g.leader)}
                              style={{ padding: '2px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            >
                              <TrashIcon size={12} /> <span>ડિલીટ</span>
                            </button>
                          </div>
                        </div>

                        {/* Members Pills */}
                        <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
                          <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>
                            જૂથના સાધકો:
                          </div>
                          {members.length === 0 ? (
                            <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>હજુ કોઈ સભ્ય ઉમેરેલ નથી</span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {members.map(mName => (
                                <span
                                  key={mName}
                                  style={{
                                    background: '#e0f2fe',
                                    color: '#0369a1',
                                    border: '1px solid #bae6fd',
                                    borderRadius: '6px',
                                    padding: '3px 8px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                >
                                  <span>{mName}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveMemberFromGroup(g, mName)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#ef4444',
                                      cursor: 'pointer',
                                      fontSize: '12px',
                                      fontWeight: 'bold',
                                      padding: '0 2px'
                                    }}
                                    title="ગ્રુપમાંથી હટાવો"
                                  >
                                    ✕
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Add Member Dropdown */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <select
                            id={`add_mem_${g.id || gIdx}`}
                            defaultValue=""
                            style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                          >
                            <option value="">-- નવો સાધક ઉમેરો --</option>
                            {availableMembers.map(m => (
                              <option key={m.gu} value={m.gu}>{m.gu}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              const sel = document.getElementById(`add_mem_${g.id || gIdx}`);
                              if (sel && sel.value) {
                                handleAddMemberToGroup(g, sel.value);
                                sel.value = "";
                              } else {
                                showToast('કૃપા કરીને સભ્ય પસંદ કરો!');
                              }
                            }}
                            style={{ fontSize: '11.5px', fontWeight: 700 }}
                          >
                            ➕ ઉમેરો
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* SUB-SECTION: DYNAMIC CUSTOM REPORTS BUILDER */}
            {adminSubTab === 'reports' && (
              <>
                {/* Create Custom Report Box */}
                <div style={{ background: '#fefce8', border: '1.5px solid #fde047', padding: '20px', borderRadius: '12px', marginBottom: '22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <h3 style={{ color: '#854d0e', fontSize: '17px', margin: 0, fontWeight: 900 }}>
                      ➕ {t('નવો કસ્ટમ રિપોર્ટ બનાવો (Create Custom Report)', 'Create Custom Report')}
                    </h3>
                    <span style={{ fontSize: '12px', color: '#b45309', fontWeight: 700 }}>
                      {t('આપની જરૂરિયાત મુજબ ફિલ્ડ્સ, ગુણ અને લખાણ જાતે નક્કી કરો', 'Fully customizable fields, marks scale, and filters')}
                    </span>
                  </div>

                  {/* 1. Title & Description */}
                  <div className="grid-2" style={{ marginBottom: '16px' }}>
                    <div>
                      <label style={{ fontWeight: 800 }}>📑 {t('રિપોર્ટનું નામ (Title)', 'Report Title')} <span className="req">*</span></label>
                      <input
                        type="text"
                        placeholder="દા.ત. સાપ્તાહિક મુખપાઠ સમીક્ષા / રવિવાર સભા વિશેષ"
                        value={repTitle}
                        onChange={e => setRepTitle(e.target.value)}
                        style={{ fontSize: '14px', fontWeight: 700 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontWeight: 800 }}>📝 {t('વિગત / હેતુ (Description)', 'Description')}</label>
                      <input
                        type="text"
                        placeholder="દા.ત. તમામ ફરજિયાત કીર્તન અને વચનામૃતની પ્રગતિ"
                        value={repDesc}
                        onChange={e => setRepDesc(e.target.value)}
                        style={{ fontSize: '14px' }}
                      />
                    </div>
                  </div>

                  {/* 2. Field Selection: 5 Fields vs 10 Fields vs Custom & Add New Custom Fields */}
                  <div style={{ background: '#ffffff', padding: '16px', borderRadius: '10px', border: '1.5px solid #cbd5e1', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <strong style={{ fontSize: '13.5px', color: '#1e293b' }}>
                          📋 {t('રિપોર્ટમાં કેટલા ફિલ્ડ્સ રાખવા છે? (Select Report Fields):', 'How many fields in report?')}
                        </strong>
                        <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                          {t('૧૦ મૂળભૂત ફિલ્ડ્સ ઉપરાંત આપ આપની જરૂરિયાત મુજબ ગમે તેટલા નવા કસ્ટમ ફિલ્ડ્સ પણ ઉમેરી શકો છો.', 'Select from 10 standard fields or add unlimited custom fields as needed.')}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setRepFieldCount('5');
                            setRepSelectedFields(['sr', 'giver', 'type', 'title', 'marks']);
                          }}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontWeight: 800,
                            fontSize: '12px',
                            cursor: 'pointer',
                            border: repFieldCount === '5' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                            background: repFieldCount === '5' ? '#eff6ff' : '#ffffff',
                            color: repFieldCount === '5' ? '#1d4ed8' : '#475569'
                          }}
                        >
                          🔘 {t('૫ મુખ્ય ફિલ્ડ્સ (5 Fields)', '5 Fields')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRepFieldCount('10');
                            setRepSelectedFields(['sr', 'date', 'giver', 'taker', 'type', 'num', 'title', 'marks', 'maxMarks', 'note']);
                          }}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontWeight: 800,
                            fontSize: '12px',
                            cursor: 'pointer',
                            border: repFieldCount === '10' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                            background: repFieldCount === '10' ? '#eff6ff' : '#ffffff',
                            color: repFieldCount === '10' ? '#1d4ed8' : '#475569'
                          }}
                        >
                          🔘 {t('૧૦ વિસ્તૃત ફિલ્ડ્સ (10 Fields)', '10 Fields')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRepFieldCount('custom')}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontWeight: 800,
                            fontSize: '12px',
                            cursor: 'pointer',
                            border: repFieldCount === 'custom' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                            background: repFieldCount === 'custom' ? '#eff6ff' : '#ffffff',
                            color: repFieldCount === 'custom' ? '#1d4ed8' : '#475569'
                          }}
                        >
                          ⚙️ {t('કસ્ટમ ફિલ્ડ્સ (Custom)', 'Custom Selection')} ({repSelectedFields.length})
                        </button>
                      </div>
                    </div>

                    {/* All Selectable Fields Checkboxes (10 Standard + User Custom Fields) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '8px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
                      {getAllReportFields().map(f => {
                        const isChecked = repSelectedFields.includes(f.id);
                        return (
                          <div
                            key={f.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: isChecked ? (f.isCustom ? '#fef3c7' : '#ffffff') : '#ffffff',
                              border: isChecked ? (f.isCustom ? '1px solid #f59e0b' : '1px solid #93c5fd') : '1px solid #e2e8f0',
                              borderRadius: '6px',
                              padding: '5px 8px'
                            }}
                          >
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: isChecked ? 800 : 500, color: isChecked ? '#1e293b' : '#64748b', cursor: 'pointer', flex: 1, margin: 0 }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setRepFieldCount('custom');
                                  if (isChecked) {
                                    if (repSelectedFields.length > 1) {
                                      setRepSelectedFields(repSelectedFields.filter(x => x !== f.id));
                                    } else {
                                      showToast('ઓછામાં ઓછું ૧ ફિલ્ડ પસંદ રહેવું જોઈએ');
                                    }
                                  } else {
                                    setRepSelectedFields([...repSelectedFields, f.id]);
                                  }
                                }}
                                style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                              />
                              <span>
                                {f.labelGu}
                                {f.isCustom && <span style={{ marginLeft: '4px', fontSize: '10px', color: '#b45309', fontWeight: 900 }}>✨ કસ્ટમ</span>}
                              </span>
                            </label>

                            {f.isCustom && (
                              <button
                                type="button"
                                onClick={() => handleRemoveCustomField(f.id, f.labelGu)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#ef4444',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  padding: '0 2px'
                                }}
                                title="કસ્ટમ ફિલ્ડ હટાવો"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* ➕ Dynamic Custom Field Creator Card */}
                    <div style={{
                      background: '#fffdf5',
                      border: '1.5px dashed #f59e0b',
                      borderRadius: '8px',
                      padding: '12px 14px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                        <strong style={{ fontSize: '12.5px', color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>➕</span> <span>{t('નવું કસ્ટમ ફિલ્ડ ઉમેરો (Add Any New Custom Field):', 'Add Custom Field:')}</span>
                        </strong>
                        <span style={{ fontSize: '11px', color: '#92400e' }}>
                          {t('આપની જરૂરિયાત મુજબ નવું કોલમ ઉમેરો (દા.ત. સભા સ્થળ, હાજરી, ગ્રેડ, સહી)', 'Add custom column (e.g. Center, Attendance, Grade, Sign)')}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
                        <input
                          type="text"
                          value={newFieldNameInput}
                          onChange={e => setNewFieldNameInput(e.target.value)}
                          placeholder="દા.ત. સભા સ્થળ / કેન્દ્ર, હાજરી, ગ્રેડ, તપાસનાર સહી..."
                          style={{
                            flex: 2,
                            minWidth: '220px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            fontSize: '12.5px'
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddNewCustomField();
                            }
                          }}
                        />
                        <input
                          type="text"
                          value={newFieldDefaultInput}
                          onChange={e => setNewFieldDefaultInput(e.target.value)}
                          placeholder="ડિફોલ્ટ મૂલ્ય (વૈકલ્પિક, દા.ત. હાજર, A+)"
                          style={{
                            flex: 1,
                            minWidth: '150px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            fontSize: '12.5px'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleAddNewCustomField()}
                          style={{
                            background: '#d97706',
                            color: '#ffffff',
                            border: 'none',
                            padding: '7px 16px',
                            borderRadius: '6px',
                            fontWeight: 800,
                            fontSize: '12.5px',
                            cursor: 'pointer'
                          }}
                        >
                          ➕ {t('ફિલ્ડ ઉમેરો', 'Add Field')}
                        </button>
                      </div>

                      {/* Quick Suggestions for Custom Fields */}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: '#78350f', fontWeight: 700 }}>ક્વિક સજેશન:</span>
                        {[
                          { label: '🏛️ સભા સ્થળ / કેન્દ્ર', def: '' },
                          { label: '📋 હાજરી સ્થિતિ', def: 'હાજર' },
                          { label: '🎖️ ગ્રેડ / કક્ષા', def: 'A' },
                          { label: '✍️ તપાસનાર સહી', def: '' },
                          { label: '🚩 વિભાગ / શાખા', def: '' },
                          { label: '❓ પ્રશ્નોત્તરી ગુણ', def: '' }
                        ].map(sug => (
                          <button
                            key={sug.label}
                            type="button"
                            onClick={() => handleAddNewCustomField(sug.label, sug.def)}
                            style={{
                              background: '#fef3c7',
                              border: '1px solid #fde68a',
                              color: '#92400e',
                              borderRadius: '4px',
                              padding: '2px 8px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            + {sug.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 3. Marks Evaluation Scale: 5 Marks vs 10 Marks */}
                  <div style={{ background: '#ffffff', padding: '14px 16px', borderRadius: '10px', border: '1.5px solid #cbd5e1', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <strong style={{ fontSize: '13.5px', color: '#1e293b' }}>
                          ⭐ {t('મહત્તમ ગુણ પદ્ધતિ (Max Marks Scale):', 'Max Marks Scale:')}
                        </strong>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          {t('આ રિપોર્ટનું મૂલ્યાંકન ૫ ગુણમાંથી કે ૧૦ ગુણમાંથી કરવું છે?', 'Evaluate this report out of 5 or 10 marks?')}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {[5, 10, 20].map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setRepMarksScale(s)}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '6px',
                              fontWeight: 800,
                              fontSize: '12.5px',
                              cursor: 'pointer',
                              border: repMarksScale === s ? '2px solid #16a34a' : '1px solid #cbd5e1',
                              background: repMarksScale === s ? '#f0fdf4' : '#ffffff',
                              color: repMarksScale === s ? '#15803d' : '#475569'
                            }}
                          >
                            {s === 5 ? '⭐ ૫ ગુણમાંથી (5 Marks)' : s === 10 ? '⭐ ૧૦ ગુણમાંથી (10 Marks)' : `⭐ ${s} ગુણ`}
                          </button>
                        ))}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>કસ્ટમ:</span>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={repMarksScale}
                            onChange={e => setRepMarksScale(parseFloat(e.target.value) || 5)}
                            style={{ width: '65px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 800, textAlign: 'center' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4. Free-Form Filters with Suggestion Pills */}
                  <div className="grid-2" style={{ marginBottom: '16px' }}>
                    {/* Free-Form Type Filter */}
                    <div>
                      <label style={{ fontWeight: 800 }}>🏷️ {t('મુખપાઠ પ્રકાર (Type Filter):', 'Type Filter:')}</label>
                      <input
                        type="text"
                        value={repType}
                        onChange={e => setRepType(e.target.value)}
                        placeholder="દા.ત. તમામ, વચનામૃત, કીર્તન અથવા આપનું લખાણ..."
                        style={{ fontSize: '13.5px', marginBottom: '6px' }}
                      />
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {['તમામ', 'વચનામૃત', 'કીર્તન', 'નિત્ય નિયમ', 'પાઠ'].map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setRepType(p)}
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              border: repType === p ? '1px solid #2563eb' : '1px solid #cbd5e1',
                              background: repType === p ? '#eff6ff' : '#f8fafc',
                              color: repType === p ? '#1d4ed8' : '#475569',
                              cursor: 'pointer',
                              fontWeight: 700
                            }}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Free-Form Category Filter */}
                    <div>
                      <label style={{ fontWeight: 800 }}>📂 {t('કેટેગરી (Category Filter):', 'Category Filter:')}</label>
                      <input
                        type="text"
                        value={repClass}
                        onChange={e => setRepClass(e.target.value)}
                        placeholder="દા.ત. બંને, ફરજિયાત, વિશેષ અથવા આપનું લખાણ..."
                        style={{ fontSize: '13.5px', marginBottom: '6px' }}
                      />
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {['બંને', 'ફરજિયાત', 'વિશેષ', 'પ્રથમ સત્ર', 'દ્વિતીય સત્ર'].map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setRepClass(c)}
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              border: repClass === c ? '1px solid #2563eb' : '1px solid #cbd5e1',
                              background: repClass === c ? '#eff6ff' : '#f8fafc',
                              color: repClass === c ? '#1d4ed8' : '#475569',
                              cursor: 'pointer',
                              fontWeight: 700
                            }}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Free-Form Leader Filter */}
                    <div>
                      <label style={{ fontWeight: 800 }}>👑 {t('સ્ટેન્ડ-અપ લીડર / ગ્રૂપ:', 'Leader / Group:')}</label>
                      <input
                        type="text"
                        value={repLeader}
                        onChange={e => setRepLeader(e.target.value)}
                        placeholder="દા.ત. તમામ અથવા ચોક્કસ લીડરનું નામ..."
                        style={{ fontSize: '13.5px', marginBottom: '6px' }}
                      />
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setRepLeader('તમામ')}
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            border: repLeader === 'તમામ' ? '1px solid #2563eb' : '1px solid #cbd5e1',
                            background: repLeader === 'તમામ' ? '#eff6ff' : '#f8fafc',
                            color: repLeader === 'તમામ' ? '#1d4ed8' : '#475569',
                            cursor: 'pointer',
                            fontWeight: 700
                          }}
                        >
                          તમામ ગ્રુપો
                        </button>
                        {groupsList.map(g => (
                          <button
                            key={g.leader}
                            type="button"
                            onClick={() => setRepLeader(g.leader)}
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              border: repLeader === g.leader ? '1px solid #2563eb' : '1px solid #cbd5e1',
                              background: repLeader === g.leader ? '#eff6ff' : '#f8fafc',
                              color: repLeader === g.leader ? '#1d4ed8' : '#475569',
                              cursor: 'pointer',
                              fontWeight: 700
                            }}
                          >
                            👑 {g.leader}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Minimum Marks Filter */}
                    <div>
                      <label style={{ fontWeight: 800 }}>⭐ {t('ન્યૂનતમ ગુણ ફિલ્ટર (Min Marks):', 'Min Marks:')}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max={repMarksScale}
                          value={repMinMarks}
                          onChange={e => setRepMinMarks(e.target.value)}
                          placeholder="0"
                          style={{ fontSize: '13.5px', fontWeight: 800, padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                        />
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          / {repMarksScale} ગુણમાંથી
                        </span>
                      </div>
                      <span style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                        {parseFloat(repMinMarks) > 0 ? `ફક્ત ${repMinMarks} કે તેથી વધુ ગુણવાળા રેકોર્ડ્સ આવશે` : 'કોઈપણ ગુણ (તમામ રેકોર્ડ્સ)'}
                      </span>
                    </div>
                  </div>

                  {/* 5. Mukto Visibility Option */}
                  <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '8px', border: '1px solid #fef08a', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <strong style={{ fontSize: '13.5px', color: '#1e293b' }}>
                        👥 {t('મુક્તોને સાઇડબારમાં આ રિપોર્ટ જોવાની છૂટ આપવી?', 'Visible to Muktos in Sidebar?')}
                      </strong>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {t('જો ચાલુ હશે, તો તમામ મુક્તો પણ તેમના એકાઉન્ટમાં આ રિપોર્ટ જોઈ શકશે.', 'Muktos will be able to access and print this report.')}
                      </div>
                    </div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 800 }}>
                      <input
                        type="checkbox"
                        checked={repAccess === 'mukto'}
                        onChange={e => setRepAccess(e.target.checked ? 'mukto' : 'admin')}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span style={{ color: repAccess === 'mukto' ? '#15803d' : '#64748b' }}>
                        {repAccess === 'mukto' ? '✓ મુક્તો માટે પણ સક્રિય' : '👑 માત્ર એડમિન માટે'}
                      </span>
                    </label>
                  </div>

                  <button type="button" className="btn btn-gold" onClick={handleSaveCustomReport} style={{ fontWeight: 800, padding: '10px 24px', fontSize: '14px' }}>
                    💾 {t('કસ્ટમ રિપોર્ટ Firebase માં સેવ કરો', 'Save Custom Report to Cloud')}
                  </button>
                </div>

                {/* Existing Custom Reports List */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                  <h3 style={{ color: '#854d0e', fontSize: '16px', fontWeight: 800 }}>
                    📑 `customReports` Collection ({customReportsList.length} રિપોર્ટ્સ)
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    {t('સાઇડબારમાં ક્લિક કરીને કોઈપણ રિપોર્ટ જોઈ શકાય છે.', 'Click on any report in sidebar to view analytics.')}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
                  {customReportsList.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '30px', color: '#64748b', background: '#f8fafc', borderRadius: '10px' }}>
                      {t('હજુ સુધી કોઈ કસ્ટમ રિપોર્ટ બનાવવામાં આવ્યો નથી.', 'No custom reports created yet.')}
                    </div>
                  ) : (
                    customReportsList.map(rep => (
                      <div
                        key={rep.id}
                        style={{
                          background: '#ffffff',
                          border: '1.5px solid #cbd5e1',
                          borderRadius: '12px',
                          padding: '16px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <h4 style={{ margin: 0, color: '#1e3a5f', fontSize: '16px', fontWeight: 800 }}>
                            📑 {rep.title}
                          </h4>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: rep.access === 'mukto' ? '#dcfce7' : '#fef3c7',
                            color: rep.access === 'mukto' ? '#15803d' : '#b45309'
                          }}>
                            {rep.access === 'mukto' ? '👥 મુક્તો જોઈ શકે' : '👑 માત્ર એડમિન'}
                          </span>
                        </div>

                        {rep.desc && (
                          <div style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '10px' }}>
                            {rep.desc}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                          <span style={{ fontSize: '11px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                            પ્રકાર: {rep.type || 'તમામ'}
                          </span>
                          <span style={{ fontSize: '11px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                            કેટેગરી: {rep.classification || 'તમામ'}
                          </span>
                          {rep.leader && rep.leader !== 'ALL' && (
                            <span style={{ fontSize: '11px', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                              👑 {rep.leader}
                            </span>
                          )}
                          {rep.minMarks > 0 && (
                            <span style={{ fontSize: '11px', background: '#f0fdf4', color: '#15803d', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                              ≥ {rep.minMarks} ગુણ
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setActiveCustomReportId(rep.id);
                              setActiveTab('custom_report');
                            }}
                            style={{ fontSize: '11.5px', fontWeight: 700 }}
                          >
                            👁️ રિપોર્ટ ખોલો
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleToggleReportAccess(rep)}
                            style={{ fontSize: '11.5px', fontWeight: 700 }}
                            title="મુક્તોની વિઝિબિલિટી બદલો"
                          >
                            🔄 અધિકાર બદલો
                          </button>
                          <button
                            type="button"
                            className="btn btn-red btn-sm"
                            onClick={() => handleDeleteCustomReport(rep.id, rep.title)}
                            style={{ fontSize: '11.5px', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                          >
                            <TrashIcon size={12} /> <span>ડિલીટ</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {/* SUB-SECTION 4: BRANDING & THEME SETTINGS (IMAGE 3) */}
            {adminSubTab === 'branding' && (
              <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', padding: '20px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <h3 style={{ color: 'var(--primary)', fontSize: '17px', fontWeight: 800, margin: 0 }}>
                      🎨 {t('પોર્ટલ બ્રાન્ડિંગ, શીર્ષક અને કલર થીમ કંટ્રોલ', 'Portal Branding, Titles & Theme Control')}
                    </h3>
                    <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '3px' }}>
                      {t('અહીંથી આપ જય સ્વામિનારાયણ સ્લોગન, એપનું ટાઈટલ, ટોપબાર હેડિંગ અને મૂળ કલર થીમ બદલી શકો છો. આ સેટિંગ્સ Firebase Cloud માં સેવ થઈને તમામ iPads અને કમ્પ્યુટર્સ પર એક સાથે લાગુ પડશે.',
                         'Customize greeting, app brand name, banner heading, and theme color. All changes sync via Firebase Cloud to all devices.')}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '18px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                      🙏 {t('સ્વાગત સૂત્ર (Greeting Header):', 'App Greeting Header:')}
                    </label>
                    <input
                      type="text"
                      value={admGreetingInput}
                      onChange={e => setAdmGreetingInput(e.target.value)}
                      placeholder="દા.ત. ॥ જય સ્વામિનારાયણ ॥"
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '14px', fontWeight: 700 }}
                    />
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>સાઇડબારના સૌથી ઉપર દેખાતું સૂત્ર</span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                      🏷️ {t('સાઇડબાર એપ ટાઇટલ (Brand Title):', 'Sidebar Brand Title:')}
                    </label>
                    <input
                      type="text"
                      value={admBrandTitleInput}
                      onChange={e => setAdmBrandTitleInput(e.target.value)}
                      placeholder="દા.ત. 🌸 મુખપાઠ ટ્રેકર"
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '14px', fontWeight: 700 }}
                    />
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>સાઇડબારનું મુખ્ય નામ</span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                      🏛️ {t('ટોપબાર હેડર બેનર (Portal Banner Heading):', 'Portal Banner Heading:')}
                    </label>
                    <input
                      type="text"
                      value={admPortalBannerInput}
                      onChange={e => setAdmPortalBannerInput(e.target.value)}
                      placeholder="દા.ત. SMVS મુખપાઠ કેન્દ્રીય પોર્ટલ"
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '14px', fontWeight: 700 }}
                    />
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>પોર્ટલના ઉપરના મુખ્ય બેનરનું નામ</span>
                  </div>
                </div>

                {/* Max Marks & Mukto Delete Permissions Controls */}
                <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '16px', marginBottom: '18px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '4px' }}>
                        ⭐ {t('મુખપાઠ મહત્તમ ગુણ (Max Marks Limit):', 'Max Marks Limit:')}
                      </label>
                      <select
                        value={admMaxMarksInput}
                        onChange={e => setAdmMaxMarksInput(parseFloat(e.target.value) || 5)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '14px', fontWeight: 800, color: '#15803d' }}
                      >
                        <option value="5">5 {t('ગુણ (ડિફોલ્ટ - પૂરા 5 થી 0)', 'Marks (Default 5 to 0)')}</option>
                        <option value="10">10 {t('ગુણ (10 થી 0 ગુણ)', 'Marks (10 to 0)')}</option>
                        <option value="15">15 {t('ગુણ (15 થી 0 ગુણ)', 'Marks (15 to 0)')}</option>
                        <option value="20">20 {t('ગુણ (20 થી 0 ગુણ)', 'Marks (20 to 0)')}</option>
                        <option value="25">25 {t('ગુણ (25 થી 0 ગુણ)', 'Marks (25 to 0)')}</option>
                        <option value="50">50 {t('ગુણ (50 થી 0 ગુણ)', 'Marks (50 to 0)')}</option>
                        <option value="100">100 {t('ગુણ (100 થી 0 ગુણ)', 'Marks (100 to 0)')}</option>
                      </select>
                      <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                        {t('અહીંથી ગુણ બદલવાથી તમામ નવી એન્ટ્રીઓ, બુકલેટ્સ અને આલેખમાં આપોઆપ સુધારો થશે.', 'All entry forms, booklets, and graphs dynamically adjust to this max limit.')}
                      </span>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '4px' }}>
                        🗑️ {t('મુક્તોને રેકોર્ડ ડિલીટ કરવાની છૂટ:', 'Allow Muktos to Delete Records:')}
                      </label>
                      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="checkbox"
                          id="allowMuktoDeleteCheck"
                          checked={admAllowMuktoDeleteInput}
                          onChange={e => setAdmAllowMuktoDeleteInput(e.target.checked)}
                          style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                        />
                        <label htmlFor="allowMuktoDeleteCheck" style={{ fontSize: '13px', fontWeight: 700, cursor: 'pointer', color: admAllowMuktoDeleteInput ? '#15803d' : '#dc2626' }}>
                          {admAllowMuktoDeleteInput 
                            ? t('✓ છૂટ આપેલી છે (મુક્ત દ્વારા ડિલીટ થયેલ રેકોર્ડ એડમિન આર્કાઇવમાં સચવાશે)', 'Allowed (Saved in Admin archive)')
                            : t('✕ મનાઈ છે (મુક્ત ડિલીટ કરી શકશે નહીં)', 'Disallowed (Muktos cannot delete)')
                          }
                        </label>
                      </div>
                      <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                        {t('મુક્ત ડિલીટ કરે તો પણ એડમિન પાસે હંમેશા સુરક્ષિત રહેશે.', 'Even if deleted by Mukto, Admin can restore or permanently delete it.')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2-Second Auto Background Color Cycle Control (Exclusive to Master Admin Manager) */}
                <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '16px', marginBottom: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                        🌈 {t('ઑટોમેટિક બેકગ્રાઉન્ડ કલર સાયકલ (દર ૨ સેકન્ડે બદલાવ):', 'Automatic Background Color Cycle (Every 2s):')}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                        {t('એપનું બેકગ્રાઉન્ડ દર ૨ સેકન્ડે દિવ્ય પેસ્ટલ કલર શેડ્સમાં ઑટોમેટિક બદલાય છે. બહારથી બટન હટાવીને સંપૂર્ણ કંટ્રોલ માત્ર મુખ્ય એડમિન પાસે રાખેલ છે.',
                           'App background smoothly cycles through pastel gradients every 2s. The toggle is moved exclusively inside Admin Manager.')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        id="autoBgCycleToggle"
                        checked={autoBgEnabled}
                        onChange={e => {
                          const newVal = e.target.checked;
                          setAutoBgEnabled(newVal);
                          try {
                            localStorage.setItem('SMVS_AUTO_BG_ENABLED', JSON.stringify(newVal));
                            if (isFirebaseAvailable()) {
                              set(ref(db, 'settings/branding/autoBgEnabled'), newVal).catch(() => {});
                            }
                          } catch (err) {}
                        }}
                        style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                      />
                      <label htmlFor="autoBgCycleToggle" style={{ fontSize: '13px', fontWeight: 800, cursor: 'pointer', color: autoBgEnabled ? '#15803d' : '#dc2626' }}>
                        {autoBgEnabled ? t('✓ ચાલુ (દર ૨ સેકન્ડે ઑટોમેટિક)', '✓ Active (Every 2s)') : t('✕ બંધ (સ્થિર)', '✕ Stopped')}
                      </label>
                    </div>
                  </div>
                </div>

                {/* 12 Colors Theme Selector Section */}
                <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '16px', marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '10px' }}>
                    🎨 {t('પોર્ટલ ડિફોલ્ટ કલર થીમ પસંદ કરો (12 Themes):', 'Select Default Theme Color (12 Themes):')}
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                    {THEME_COLORS.map(item => (
                      <div
                        key={item.id}
                        onClick={() => setTheme(item.id)}
                        style={{
                          border: `2px solid ${theme === item.id ? item.color : '#e2e8f0'}`,
                          borderRadius: '8px',
                          padding: '10px',
                          cursor: 'pointer',
                          background: theme === item.id ? 'rgba(0,0,0,0.03)' : '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: item.color, border: '2px solid #fff', boxShadow: '0 0 4px rgba(0,0,0,0.2)' }} />
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: theme === item.id ? item.color : '#334155' }}>
                            {lang === 'gu' ? item.nameGu : item.nameEn}
                          </div>
                          {theme === item.id && (
                            <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 800 }}>✓ સક્રિય</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveBranding}
                    style={{ fontWeight: 800, padding: '10px 20px', fontSize: '14px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                  >
                    <span>💾</span> <span>{t('બ્રાન્ડિંગ અને થીમ સેવ કરો (Save to Cloud)', 'Save Branding & Theme to Cloud')}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setAdmGreetingInput('॥ જય સ્વામિનારાયણ ॥');
                      setAdmBrandTitleInput('🌸 મુખપાઠ ટ્રેકર');
                      setAdmPortalBannerInput('SMVS મુખપાઠ કેન્દ્રીય પોર્ટલ');
                      setTheme('blue');
                    }}
                  >
                    {t('ડિફોલ્ટ રીસેટ કરો', 'Reset to Defaults')}
                  </button>
                </div>
              </div>
            )}

            {/* SUB-SECTION 5: SECURITY */}
            {adminSubTab === 'security' && (
              <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', padding: '18px', borderRadius: '12px' }}>
                <h3 style={{ color: '#1e40af', fontSize: '16px', marginBottom: '12px', fontWeight: 800 }}>🔑 {t('પોર્ટલ પિન & સુરક્ષા (Firebase: settings/portalAuth)', 'Portal PIN & Security')}</h3>
                <div className="grid-2" style={{ marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '4px' }}>
                      👑 {t('મુખ્ય એડમિન ગુપ્ત પિન:', 'Main Admin Secret PIN:')}
                    </label>
                    <input type="text" value={admAdminPin} onChange={e => setAdmAdminPin(e.target.value)} style={{ fontWeight: 800, color: '#1e40af', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', width: '100%' }} />
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>એડમિન પોર્ટલમાં પ્રવેશ માટેનો ગુપ્ત પિન</span>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '4px' }}>
                      👤 {t('મુક્ત પોર્ટલ પાસવર્ડ સુરક્ષા:', 'Mukto Portal Password Protection:')}
                    </label>
                    <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        id="chkRequireMuktoPin"
                        checked={admRequireMuktoPin}
                        onChange={e => setAdmRequireMuktoPin(e.target.checked)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <label htmlFor="chkRequireMuktoPin" style={{ fontSize: '13px', fontWeight: 700, cursor: 'pointer', color: admRequireMuktoPin ? '#15803d' : '#64748b' }}>
                        {admRequireMuktoPin ? t('✓ પાસવર્ડ સુરક્ષા ચાલુ કરવી છે', 'Password Protection Enabled') : t('✕ પાસવર્ડ વગર સીધો પ્રવેશ (કોઈ પાસવર્ડ નહીં - ડિફોલ્ટ)', 'No Password (Direct Entry - Default)')}
                      </label>
                    </div>
                    {admRequireMuktoPin && (
                      <div style={{ marginTop: '8px' }}>
                        <input
                          type="text"
                          value={admMuktoPin}
                          onChange={e => setAdmMuktoPin(e.target.value)}
                          placeholder="મુક્ત પિન દાખલ કરો"
                          style={{ fontWeight: 800, color: '#15803d', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', width: '100%' }}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleSavePins} style={{ fontWeight: 800, padding: '9px 18px' }}>
                  💾 {t('સુરક્ષા સેટિંગ્સ સેવ કરો (Save to Cloud)', 'Save Security Settings to Cloud')}
                </button>
              </div>
            )}
          </div>
        )}

      </main>

      {/* Toast Notification */}
      {toastMsg && (
        <div className="toast-box">
          {toastMsg}
        </div>
      )}

    </div>
  );
}
