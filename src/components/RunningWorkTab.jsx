import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { CHESTA_PADS } from '../data/masterData';

// Default sample rows based on user's image
const DEFAULT_ROWS = [
  { id: 1, date: '16-11-2026', dayLabel: 'દિવસ - 1', title: 'ચેષ્ટા પદ - ૧ (પ્રથમ શ્રીહરિને રે ચરણે શીશ નમાવું)', note: '' },
  { id: 2, date: '17-11-2026', dayLabel: 'દિવસ - 2', title: 'ચેષ્ટા પદ - ૨ (સાંભળ સૈયર રે લીલા નટનાગરની)', note: '' },
  { id: 3, date: '18-11-2026', dayLabel: 'દિવસ - 3', title: 'ચેષ્ટા પદ - ૩ (મનુષ્યલીલા રે કરતાં મંગલકારી)', note: '' },
  { id: 4, date: '19-11-2026', dayLabel: 'દિવસ - 4', title: 'ચેષ્ટા પદ - ૪ (મોહનજીની રે લીલા અતિ સુખકારી)', note: '' },
  { id: 5, date: '20-11-2026', dayLabel: 'દિવસ - 5', title: 'ચેષ્ટા પદ - ૫ (સાંભળ સજની રે દિવ્ય સ્વરૂપ મોરારિ)', note: '' },
  { id: 6, date: '21-11-2026', dayLabel: 'દિવસ - 6', title: 'વચનામૃત ગઢડા પ્રથમ-૧૫', note: '' },
];

const GUJARATI_MONTHS = [
  'જાન્યુઆરી', 'ફેબ્રુઆરી', 'માર્ચ', 'એપ્રિલ', 'મે', 'જૂન', 
  'જુલાઈ', 'ઓગસ્ટ', 'સપ્ટેમ્બર', 'ઓક્ટોબર', 'નવેમ્બર', 'ડિસેમ્બર'
];

export default function RunningWorkTab({ membersList = [], vachanamrutsList = [], kirtansList = [], lang = 'gu' }) {
  // 1. Slip Header Settings
  const [slipTitle, setSlipTitle] = useState('મુખપાઠ સ્લીપ');
  const [monthText, setMonthText] = useState(() => {
    const now = new Date();
    return `${GUJARATI_MONTHS[now.getMonth()]}-${now.getFullYear()}`;
  });
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [rowsCount, setRowsCount] = useState(6);
  const [rowsData, setRowsData] = useState(() => {
    const saved = localStorage.getItem('SMVS_MUKHPATH_RUNNING_WORK');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.rowsData) && parsed.rowsData.length > 0) return parsed.rowsData;
      } catch (e) {
        console.warn('Failed to parse saved running work draft:', e);
      }
    }
    return DEFAULT_ROWS;
  });

  // 2. Member Selection Mode
  // 'all' | 'custom' | 'single' | 'blank'
  const [recipientMode, setRecipientMode] = useState('all');
  const [selectedMemberNames, setSelectedMemberNames] = useState([]);
  const [singleMemberName, setSingleMemberName] = useState('');
  const [singleFillFour, setSingleFillFour] = useState(true); // Fill 4 slips on 1 A4 page for this single member
  const [blankSlipsCount, setBlankSlipsCount] = useState(4); // Multiples of 4 (4, 8, 12, 16...)

  // 3. UI Helpers
  const [itemSearchText, setItemSearchText] = useState('');
  const [searchTargetRowIndex, setSearchTargetRowIndex] = useState(null);
  const [searchTypeFilter, setSearchTypeFilter] = useState('all'); // 'all' | 'vach' | 'kirtan'
  const [viewMode, setViewMode] = useState('preview'); // 'edit' | 'preview'

  // Persist state in localStorage
  useEffect(() => {
    const draft = {
      slipTitle,
      monthText,
      startDate,
      rowsData
    };
    localStorage.setItem('SMVS_MUKHPATH_RUNNING_WORK', JSON.stringify(draft));
  }, [slipTitle, monthText, startDate, rowsData]);

  // Auto-fill dates based on startDate
  const handleAutoFillDates = (baseDateStr = startDate, count = rowsData.length) => {
    if (!baseDateStr) return;
    const base = new Date(baseDateStr);
    if (isNaN(base.getTime())) return;

    const newRows = [];
    for (let i = 0; i < count; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const formattedDate = `${dd}-${mm}-${yyyy}`;

      const existing = rowsData[i] || {};
      newRows.push({
        id: i + 1,
        date: formattedDate,
        dayLabel: `દિવસ - ${i + 1}`,
        title: existing.title || '',
        note: existing.note || ''
      });
    }
    setRowsData(newRows);
  };

  // Adjust rows count
  const handleSetRowsCount = (newCount) => {
    const count = Math.max(1, Math.min(15, parseInt(newCount) || 6));
    setRowsCount(count);
    if (count > rowsData.length) {
      const added = [];
      for (let i = rowsData.length; i < count; i++) {
        added.push({
          id: i + 1,
          date: '',
          dayLabel: `દિવસ - ${i + 1}`,
          title: '',
          note: ''
        });
      }
      setRowsData([...rowsData, ...added]);
    } else if (count < rowsData.length) {
      setRowsData(rowsData.slice(0, count));
    }
  };

  // Update specific row property
  const handleUpdateRow = (index, field, value) => {
    const updated = [...rowsData];
    updated[index] = { ...updated[index], [field]: value };
    setRowsData(updated);
  };

  // Reset to sample rows
  const handleResetSample = () => {
    setSlipTitle('મુખપાઠ સ્લીપ');
    setMonthText('નવેમ્બર-2026');
    setStartDate('2026-11-16');
    setRowsCount(DEFAULT_ROWS.length);
    setRowsData(DEFAULT_ROWS);
  };

  // Combined searchable master items
  const masterItems = useMemo(() => {
    const vList = vachanamrutsList.map(v => ({
      type: 'વચનામૃત',
      label: v.code ? `વચનામૃત ${v.code}` : (v.title ? `વચનામૃત ${v.title}` : `વચનામૃત ${v.gu || ''}`),
      sec: v.sec || '',
      num: v.num
    }));
    const kList = kirtansList.map(k => ({
      type: 'કીર્તન',
      label: k.title || k.gu || '',
      sec: k.sec || '',
      num: k.num
    }));
    const cList = CHESTA_PADS.map(c => ({
      type: 'ચેષ્ટા',
      label: c.title,
      sec: 'ચેષ્ટા',
      num: c.num
    }));
    return { vList, kList, cList, all: [...cList, ...vList, ...kList] };
  }, [vachanamrutsList, kirtansList]);

  // Filtered items in quick item picker modal
  const filteredMasterItems = useMemo(() => {
    let list = masterItems.all;
    if (searchTypeFilter === 'vach') list = masterItems.vList;
    if (searchTypeFilter === 'kirtan') list = masterItems.kList;
    if (searchTypeFilter === 'chesta') list = masterItems.cList;

    if (!itemSearchText.trim()) return list.slice(0, 50);
    const q = itemSearchText.toLowerCase();
    return list.filter(item => 
      (item.label && item.label.toLowerCase().includes(q)) ||
      (item.sec && item.sec.toLowerCase().includes(q))
    ).slice(0, 50);
  }, [masterItems, searchTypeFilter, itemSearchText]);

  // Prepare slips to render
  const generatedSlips = useMemo(() => {
    if (recipientMode === 'blank') {
      const slips = [];
      const count = Math.max(1, blankSlipsCount || 4);
      for (let i = 0; i < count; i++) {
        slips.push({ id: `blank_${i}`, memberName: '' });
      }
      return slips;
    }

    if (recipientMode === 'single') {
      if (!singleMemberName) {
        return [{ id: 'single_blank', memberName: '' }];
      }
      if (singleFillFour) {
        return [
          { id: 'single_0', memberName: singleMemberName },
          { id: 'single_1', memberName: singleMemberName },
          { id: 'single_2', memberName: singleMemberName },
          { id: 'single_3', memberName: singleMemberName }
        ];
      }
      return [{ id: 'single_0', memberName: singleMemberName }];
    }

    if (recipientMode === 'custom') {
      if (selectedMemberNames.length === 0) {
        return [{ id: 'none', memberName: '' }];
      }
      return selectedMemberNames.map((name, idx) => ({
        id: `custom_${idx}`,
        memberName: name
      }));
    }

    // Default: 'all' members from membersList
    if (membersList.length > 0) {
      return membersList.map((m, idx) => ({
        id: m.id || `member_${idx}`,
        memberName: m.gu || m.en || ''
      }));
    }

    // Fallback if membersList is empty
    return [{ id: 'fallback_0', memberName: '' }];
  }, [recipientMode, blankSlipsCount, singleMemberName, singleFillFour, selectedMemberNames, membersList]);

  // Chunk slips into pages of exactly 4 slips per A4 page
  const slipPages = useMemo(() => {
    const pages = [];
    for (let i = 0; i < generatedSlips.length; i += 4) {
      pages.push(generatedSlips.slice(i, i + 4));
    }
    return pages;
  }, [generatedSlips]);

  // Handle Print
  const handlePrint = () => {
    window.print();
  };

  const [copiedStatus, setCopiedStatus] = useState(false);

  // Handle Export to Excel (.xlsx) matching Image 2 layout
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const wsData = [];
      const merges = [];
      let currentRow = 0;

      // Stack each slip cleanly matching Image 2
      generatedSlips.forEach((slip) => {
        const member = slip.memberName || '________________';

        // Row 1: Slip Title Banner (Merged A to E)
        const titleRow = new Array(5).fill('');
        titleRow[0] = slipTitle;
        merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 4 } });
        wsData.push(titleRow);
        currentRow++;

        // Row 2: Sub-Banner (Month A-B, Member C-E)
        const subRow = new Array(5).fill('');
        subRow[0] = `મહિનો: ${monthText}`;
        merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 1 } });
        subRow[2] = `પૂ. સંત / સાધક: ${member}`;
        merges.push({ s: { r: currentRow, c: 2 }, e: { r: currentRow, c: 4 } });
        wsData.push(subRow);
        currentRow++;

        // Row 3: Table Headers
        const headerRow = ['ક્રમ', 'તારીખ', 'દિવસ', 'કીર્તન / વચનામૃતનું નામ', 'નોંધ'];
        wsData.push(headerRow);
        currentRow++;

        // Daily Content Rows
        rowsData.forEach((row, rIdx) => {
          const dataRow = [
            rIdx + 1,
            row.date || '',
            row.dayLabel || '',
            row.title || '',
            row.note || ''
          ];
          wsData.push(dataRow);
          currentRow++;
        });

        // 1 Spacer Row between slips
        wsData.push(new Array(5).fill(''));
        currentRow++;
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!merges'] = merges;
      ws['!cols'] = [
        { wch: 6 },  // A: ક્રમ
        { wch: 14 }, // B: તારીખ
        { wch: 12 }, // C: દિવસ
        { wch: 38 }, // D: કીર્તન / વચનામૃતનું નામ
        { wch: 22 }, // E: નોંધ
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'મુખપાઠ સ્લીપ');
      XLSX.writeFile(wb, `Mukhpath_Slip_Report.xlsx`);
    } catch (err) {
      console.error('Failed to export Excel:', err);
      alert('Excel ફાઇલ બનાવવામાં ભૂલ આવી: ' + (err.message || err));
    }
  };

  // Open Google Sheets and copy rich styled HTML & TSV matching Image 2
  const handleOpenGoogleSheets = () => {
    try {
      // 1. Immediately open Google Sheets in new tab
      window.open('https://sheets.new', '_blank');

      // 2. Build rich styled HTML matching Image 2 (5-column layout stacked vertically)
      let html = `<table style="border-collapse: collapse; font-family: 'Shruti', 'Nirmala UI', Arial, sans-serif; font-size: 11pt; width: 100%; border: 1.5px solid #1F4E78;">`;
      let tsv = '';

      generatedSlips.forEach((slip) => {
        const member = slip.memberName || '________________';
        
        // --- HTML FORMAT (Matches Image 2 exactly) ---
        // 1. Title Banner (Light grayish-blue #D9E1F2 with dark blue bold text)
        html += `
          <tr>
            <td colspan="5" style="background-color: #D9E1F2; color: #1F4E78; font-size: 14pt; font-weight: bold; text-align: center; border: 1.5px solid #1F4E78; padding: 7px 4px; letter-spacing: 0.5px;">
              ${slipTitle}
            </td>
          </tr>
        `;
        // 2. Sub-Banner (Month on left, Member Name on right)
        html += `
          <tr style="background-color: #f8fafc;">
            <td colspan="2" style="border: 1.5px solid #1F4E78; padding: 6px 8px; font-weight: bold; font-size: 10pt; color: #0f172a;">
              મહિનો: ${monthText}
            </td>
            <td colspan="3" style="border: 1.5px solid #1F4E78; padding: 6px 8px; font-weight: bold; font-size: 10pt; color: #0f172a;">
              પૂ. સંત / સાધકનું નામ: ${member}
            </td>
          </tr>
        `;
        // 3. Dark Navy Blue Header Row (#1F4E78 background, white bold text)
        html += `
          <tr style="background-color: #1F4E78; color: #ffffff;">
            <th style="background-color: #1F4E78; color: #ffffff; font-weight: bold; font-size: 10.5pt; border: 1.5px solid #1F4E78; padding: 6px; text-align: center; width: 50px;">ક્રમ</th>
            <th style="background-color: #1F4E78; color: #ffffff; font-weight: bold; font-size: 10.5pt; border: 1.5px solid #1F4E78; padding: 6px; text-align: center; width: 100px;">તારીખ</th>
            <th style="background-color: #1F4E78; color: #ffffff; font-weight: bold; font-size: 10.5pt; border: 1.5px solid #1F4E78; padding: 6px; text-align: center; width: 90px;">દિવસ</th>
            <th style="background-color: #1F4E78; color: #ffffff; font-weight: bold; font-size: 10.5pt; border: 1.5px solid #1F4E78; padding: 6px; text-align: left; width: 300px;">કીર્તન / વચનામૃતનું નામ</th>
            <th style="background-color: #1F4E78; color: #ffffff; font-weight: bold; font-size: 10.5pt; border: 1.5px solid #1F4E78; padding: 6px; text-align: left; width: 170px;">નોંધ</th>
          </tr>
        `;
        // 4. Daily content rows with clean borders
        rowsData.forEach((row, rIdx) => {
          const bg = rIdx % 2 === 1 ? '#f8fafc' : '#ffffff';
          html += `
            <tr style="background-color: ${bg};">
              <td style="border: 1px solid #8EA9DB; text-align: center; padding: 6px; font-weight: bold; color: #0f172a;">${rIdx + 1}</td>
              <td style="border: 1px solid #8EA9DB; text-align: center; padding: 6px; color: #0f172a;">${row.date || ''}</td>
              <td style="border: 1px solid #8EA9DB; text-align: center; padding: 6px; color: #0f172a;">${row.dayLabel || ''}</td>
              <td style="border: 1px solid #8EA9DB; text-align: left; padding: 6px 8px; color: #0f172a; font-weight: 500;">${row.title || ''}</td>
              <td style="border: 1px solid #8EA9DB; text-align: left; padding: 6px 8px; color: #0f172a;">${row.note || ''}</td>
            </tr>
          `;
        });
        // 5. Blank spacer row between slips
        html += `
          <tr>
            <td colspan="5" style="height: 18px; border: none; background: #ffffff;"></td>
          </tr>
        `;

        // --- TSV FORMAT ---
        tsv += `${slipTitle}\t\t\t\t\n`;
        tsv += `મહિનો: ${monthText}\t\tપૂ. સંત / સાધક: ${member}\t\t\n`;
        tsv += `ક્રમ\tતારીખ\tદિવસ\tકીર્તન / વચનામૃતનું નામ\tનોંધ\n`;
        rowsData.forEach((row, rIdx) => {
          tsv += `${rIdx + 1}\t${row.date || ''}\t${row.dayLabel || ''}\t${row.title || ''}\t${row.note || ''}\n`;
        });
        tsv += '\n\n';
      });

      html += `</table>`;

      // 3. Copy rich HTML + fallback text to clipboard
      if (navigator && navigator.clipboard && window.ClipboardItem) {
        const htmlBlob = new Blob([html], { type: 'text/html' });
        const textBlob = new Blob([tsv], { type: 'text/plain' });
        navigator.clipboard.write([
          new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob
          })
        ]).then(() => {
          setCopiedStatus(true);
          setTimeout(() => setCopiedStatus(false), 3500);
        }).catch(() => {
          fallbackCopyHtml(html, tsv);
        });
      } else {
        fallbackCopyHtml(html, tsv);
      }
    } catch (e) {
      console.warn('Google Sheets export error:', e);
    }
  };

  const handleCopyToClipboard = handleOpenGoogleSheets;

  const fallbackCopyHtml = (htmlText, plainText) => {
    try {
      const listener = (e) => {
        e.clipboardData.setData('text/html', htmlText);
        e.clipboardData.setData('text/plain', plainText);
        e.preventDefault();
      };
      document.addEventListener('copy', listener);
      document.execCommand('copy');
      document.removeEventListener('copy', listener);
      setCopiedStatus(true);
      setTimeout(() => setCopiedStatus(false), 3500);
    } catch (err) {
      const textarea = document.createElement('textarea');
      textarea.value = plainText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedStatus(true);
      setTimeout(() => setCopiedStatus(false), 3500);
    }
  };

  return (
    <div className="running-work-wrapper" style={{ padding: '16px', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* ================= STYLES FOR SCREEN & A4 PRINT ================= */}
      <style>{`
        /* Slip Header Theme */
        .slip-box {
          border: 1.8px solid #1F4E78;
          border-radius: 4px;
          background: #ffffff;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          font-family: 'Shruti', 'Nirmala UI', system-ui, -apple-system, sans-serif;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
          position: relative;
        }

        .slip-top-banner {
          background-color: #D9E1F2 !important;
          color: #1F4E78 !important;
          font-weight: 800;
          font-size: 14pt;
          text-align: center;
          padding: 6px 4px;
          border-bottom: 1.5px solid #1F4E78;
          letter-spacing: 0.5px;
        }

        .slip-sub-banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 5px 8px;
          font-size: 9.5pt;
          font-weight: 700;
          color: #0f172a;
          border-bottom: 1.5px solid #1F4E78;
          background-color: #f8fafc;
        }

        .slip-table {
          width: 100%;
          border-collapse: collapse;
          margin: 0;
          table-layout: fixed;
        }

        .slip-table th {
          background-color: #1F4E78 !important;
          color: #ffffff !important;
          font-weight: 700;
          font-size: 8.8pt;
          padding: 5px 2px;
          text-align: center;
          border: 1px solid #1F4E78;
          white-space: nowrap;
        }

        .slip-table td {
          border: 1px solid #8EA9DB;
          padding: 4px 4px;
          font-size: 8.8pt;
          color: #0f172a;
          vertical-align: middle;
          height: 24px;
          box-sizing: border-box;
        }

        .slip-table tr:nth-child(even) td {
          background-color: #f8fafc;
        }

        .slip-table tr:hover td {
          background-color: #eff6ff;
        }

        /* Screen A4 Preview Layout */
        .a4-sheet-preview {
          width: 210mm;
          min-height: 297mm;
          padding: 8mm;
          margin: 20px auto;
          background: #ffffff;
          box-shadow: 0 4px 18px rgba(0,0,0,0.12);
          border-radius: 6px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
          gap: 6mm;
          box-sizing: border-box;
          position: relative;
        }

        /* Cutting guides on screen */
        .cutting-guide-v {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 50%;
          width: 0;
          border-left: 1px dashed #cbd5e1;
          pointer-events: none;
        }
        .cutting-guide-h {
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          height: 0;
          border-top: 1px dashed #cbd5e1;
          pointer-events: none;
        }

        /* ================= PRINT MEDIA SPECIFIC RULES ================= */
        @media print {
          @page {
            size: A4 portrait;
            margin: 4mm 5mm;
          }

          /* Hide ALL portal headers, sidebars, buttons, etc. */
          body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .app-sidebar,
          .portal-topbar,
          .portal-footer,
          .running-work-controls,
          .no-print,
          .toast-box,
          button,
          input,
          select {
            display: none !important;
          }

          .running-work-wrapper {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
          }

          .print-area-root {
            display: block !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .a4-sheet-preview {
            width: 202mm !important;
            height: 288mm !important;
            max-height: 288mm !important;
            margin: 0 auto !important;
            padding: 2mm !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            grid-template-rows: 1fr 1fr !important;
            gap: 4mm !important;
            box-sizing: border-box !important;
            page-break-after: always !important;
            break-after: page !important;
          }

          .a4-sheet-preview:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }

          .slip-box {
            box-shadow: none !important;
            border: 1.8px solid #1F4E78 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .slip-top-banner {
            background-color: #D9E1F2 !important;
            color: #1F4E78 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .slip-sub-banner {
            background-color: #f8fafc !important;
            color: #0f172a !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .slip-table th {
            background-color: #1F4E78 !important;
            color: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .slip-table td {
            border: 1px solid #8EA9DB !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .cutting-guide-v,
          .cutting-guide-h {
            border-color: #94a3b8 !important;
            border-style: dashed !important;
          }
        }
      `}</style>

      {/* ================= SCREEN CONTROLS & EDIT PANEL ================= */}
      <div className="running-work-controls no-print">
        
        {/* Top Header Card */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'linear-gradient(135deg, #1e3a8a 0%, #1F4E78 100%)',
          color: '#ffffff',
          padding: '18px 24px',
          borderRadius: '12px',
          boxShadow: '0 4px 14px rgba(30, 58, 138, 0.25)',
          marginBottom: '20px'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🖨️</span> {lang === 'gu' ? 'મુખપાઠ રનિંગ વર્ક (સ્લીપ પ્રિન્ટ પેનલ)' : 'Mukhpath Running Work (Slip Print)'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#e0e7ff' }}>
              {lang === 'gu' 
                ? 'A4 સાઇઝના પેપરમાં ૪ સ્લીપ ઓટોમેટિક જનરેટ કરો અને ૧-ક્લિકમાં પ્રિન્ટ કાઢો' 
                : 'Automatically generate 4 slips per A4 sheet and print in 1-click'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleExportExcel}
              style={{
                background: '#047857',
                color: '#ffffff',
                border: 'none',
                padding: '10px 18px',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(4, 120, 87, 0.4)'
              }}
              title="Excel (.xlsx) ફોર્મેટમાં ૪ સ્લીપનું આખું ફોર્મેટ ડાઉનલોડ કરો"
            >
              <span>📊</span> {lang === 'gu' ? 'Excel ડાઉનલોડ (.xlsx)' : 'Download Excel'}
            </button>

            <button
              type="button"
              onClick={handleOpenGoogleSheets}
              style={{
                background: copiedStatus ? '#059669' : '#0284c7',
                color: '#ffffff',
                border: 'none',
                padding: '10px 16px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)'
              }}
              title="Google Sheets નવી ટેબમાં ખોલો"
            >
              <span>{copiedStatus ? '✓' : '🟢'}</span> {copiedStatus ? (lang === 'gu' ? 'કોપી થઈ ગયું!' : 'Copied!') : (lang === 'gu' ? 'Google Sheets માં ખોલો' : 'Open in Google Sheets')}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              style={{
                background: '#10b981',
                color: '#ffffff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)'
              }}
            >
              <span>🖨️</span> {lang === 'gu' ? 'A4 સાઇઝમાં પ્રિન્ટ / PDF' : 'Print A4 Slips / Save PDF'}
            </button>

            <button
              type="button"
              onClick={handleResetSample}
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                padding: '10px 14px',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer'
              }}
              title="સેમ્પલ ડેટા ફરીથી લોડ કરો"
            >
              🔄 {lang === 'gu' ? 'નમૂનો લોડ કરો' : 'Load Sample'}
            </button>
          </div>
        </div>

        {/* Configuration Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
          marginBottom: '20px'
        }}>
          
          {/* Card 1: Slip Header Setup */}
          <div style={{ background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '16px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '15px', color: '#1F4E78', fontWeight: 800, borderBottom: '2px solid #e2e8f0', paddingBottom: '6px' }}>
              ⚙️ ૧. સ્લીપ હેડર સેટિંગ્સ
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  સ્લીપનું મુખ્ય શીર્ષક (Title):
                </label>
                <input
                  type="text"
                  value={slipTitle}
                  onChange={(e) => setSlipTitle(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600 }}
                  placeholder="મુખપાઠ સ્લીપ"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    મહિનો / સમયગાળો:
                  </label>
                  <input
                    type="text"
                    value={monthText}
                    onChange={(e) => setMonthText(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    placeholder="નવેમ્બર-2026"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    દિવસોની સંખ્યા:
                  </label>
                  <select
                    value={rowsCount}
                    onChange={(e) => handleSetRowsCount(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  >
                    {[4, 5, 6, 7, 8, 9, 10].map(n => (
                      <option key={n} value={n}>{n} દિવસ (Rows)</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  શરૂઆતની તારીખ (તારીખો આપોઆપ ગણવા):
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                  <button
                    type="button"
                    onClick={() => handleAutoFillDates(startDate, rowsCount)}
                    style={{
                      background: '#3b82f6',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '7px 12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    📅 તારીખો ભરો
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Member Selection */}
          <div style={{ background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '16px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '15px', color: '#1F4E78', fontWeight: 800, borderBottom: '2px solid #e2e8f0', paddingBottom: '6px' }}>
              👥 ૨. પૂ.સંત / સાધકની પસંદગી
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  પ્રિન્ટ કોના માટે કાઢવી છે?
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                  {[
                    { key: 'all', label: '🌟 તમામ સભ્યો (All)' },
                    { key: 'custom', label: '👥 પસંદ કરેલા સભ્યો' },
                    { key: 'single', label: '👤 એક જ સભ્ય' },
                    { key: 'blank', label: '📄 ખાલી સ્લીપ (હાથે લખવા)' },
                  ].map(opt => (
                    <label 
                      key={opt.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 8px',
                        background: recipientMode === opt.key ? '#eff6ff' : '#f8fafc',
                        border: recipientMode === opt.key ? '1.5px solid #3b82f6' : '1px solid #e2e8f0',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: recipientMode === opt.key ? 700 : 500,
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="radio"
                        name="recipientMode"
                        checked={recipientMode === opt.key}
                        onChange={() => setRecipientMode(opt.key)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Mode Options: Blank Slips */}
              {recipientMode === 'blank' && (
                <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    કેટલી ખાલી સ્લીપ જોઈએ છે? (A4 પર ૪ આવશે):
                  </label>
                  <select
                    value={blankSlipsCount}
                    onChange={(e) => setBlankSlipsCount(parseInt(e.target.value) || 4)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  >
                    {[4, 8, 12, 16, 20, 24, 28, 32].map(n => (
                      <option key={n} value={n}>{n} સ્લીપ ({n / 4} પેજ)</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Mode Options: Single Member */}
              {recipientMode === 'single' && (
                <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      સભ્ય પસંદ કરો:
                    </label>
                    <select
                      value={singleMemberName}
                      onChange={(e) => setSingleMemberName(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    >
                      <option value="">-- સભ્ય પસંદ કરો --</option>
                      {membersList.map((m, idx) => (
                        <option key={idx} value={m.gu || m.en}>{m.gu || m.en} ({m.role === 'SWAMI' ? 'સંત' : 'મુક્ત'})</option>
                      ))}
                    </select>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#1e40af' }}>
                    <input
                      type="checkbox"
                      checked={singleFillFour}
                      onChange={(e) => setSingleFillFour(e.target.checked)}
                    />
                    <span>એક જ A4 પેજ પર આ જ સભ્યની ૪ નકલો (Copies) છાપો</span>
                  </label>
                </div>
              )}

              {/* Mode Options: Custom Selected Members */}
              {recipientMode === 'custom' && (
                <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                      પસંદ કરેલા: {selectedMemberNames.length}
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedMemberNames(membersList.map(m => m.gu || m.en))}
                        style={{ background: '#e2e8f0', border: 'none', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                      >
                        બધા પસંદ
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedMemberNames([])}
                        style={{ background: '#e2e8f0', border: 'none', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                      >
                        ક્લિયર
                      </button>
                    </div>
                  </div>

                  <div style={{ maxHeight: '120px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', background: '#fff' }}>
                    {membersList.map((m, idx) => {
                      const name = m.gu || m.en;
                      const isChecked = selectedMemberNames.includes(name);
                      return (
                        <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '2px 0', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedMemberNames([...selectedMemberNames, name]);
                              else setSelectedMemberNames(selectedMemberNames.filter(x => x !== name));
                            }}
                          />
                          <span>{name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Summary of pages */}
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, background: '#f1f5f9', padding: '6px 10px', borderRadius: '6px' }}>
                📊 કુલ સ્લીપ: <strong>{generatedSlips.length}</strong> | કુલ A4 પેપર: <strong>{slipPages.length}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Daily Mukhpath Items Editor */}
        <div style={{ background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '16px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#1F4E78', fontWeight: 800 }}>
              📝 ૩. રોજનું મુખપાઠ (કીર્તન / વચનામૃત એન્ટ્રી)
            </h3>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              તમે નીચે સીધું ટાઈપ પણ કરી શકો છો અથવા માસ્ટરમાંથી પસંદ કરી શકો છો
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#1F4E78', color: '#fff' }}>
                  <th style={{ padding: '8px 6px', width: '60px', textAlign: 'center' }}>ક્રમ</th>
                  <th style={{ padding: '8px 6px', width: '130px', textAlign: 'center' }}>તારીખ</th>
                  <th style={{ padding: '8px 6px', width: '110px', textAlign: 'center' }}>દિવસ</th>
                  <th style={{ padding: '8px 6px', textAlign: 'left' }}>કીર્તન / વચનામૃતનું નામ</th>
                  <th style={{ padding: '8px 6px', width: '120px', textAlign: 'center' }}>નોંધ</th>
                  <th style={{ padding: '8px 6px', width: '110px', textAlign: 'center' }}>સહાયક</th>
                </tr>
              </thead>
              <tbody>
                {rowsData.map((row, idx) => (
                  <tr key={row.id || idx} style={{ borderBottom: '1px solid #cbd5e1', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#1F4E78' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input
                        type="text"
                        value={row.date}
                        onChange={(e) => handleUpdateRow(idx, 'date', e.target.value)}
                        placeholder="DD-MM-YYYY"
                        style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', textAlign: 'center' }}
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input
                        type="text"
                        value={row.dayLabel}
                        onChange={(e) => handleUpdateRow(idx, 'dayLabel', e.target.value)}
                        placeholder={`દિવસ - ${idx + 1}`}
                        style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', textAlign: 'center' }}
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input
                        type="text"
                        value={row.title}
                        onChange={(e) => handleUpdateRow(idx, 'title', e.target.value)}
                        placeholder="કીર્તન અથવા વચનામૃતનું નામ દાખલ કરો..."
                        style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600 }}
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input
                        type="text"
                        value={row.note}
                        onChange={(e) => handleUpdateRow(idx, 'note', e.target.value)}
                        placeholder="નોંધ (ખાલી રાખવું)"
                        style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                      />
                    </td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTargetRowIndex(idx);
                          setItemSearchText('');
                        }}
                        style={{
                          background: '#3b82f6',
                          color: '#fff',
                          border: 'none',
                          padding: '5px 10px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        🔍 પસંદ કરો
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ================= QUICK ITEM PICKER MODAL ================= */}
      {searchTargetRowIndex !== null && (
        <div 
          className="no-print"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
          onClick={() => setSearchTargetRowIndex(null)}
        >
          <div 
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              maxWidth: '560px',
              width: '100%',
              padding: '20px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#1F4E78', fontWeight: 800 }}>
                મુખપાઠ આઇટમ પસંદ કરો (દિવસ - {searchTargetRowIndex + 1})
              </h3>
              <button
                type="button"
                onClick={() => setSearchTargetRowIndex(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              {[
                { key: 'all', label: 'તમામ' },
                { key: 'chesta', label: 'ચેષ્ટા' },
                { key: 'kirtan', label: 'કીર્તન' },
                { key: 'vach', label: 'વચનામૃત' }
              ].map(f => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setSearchTypeFilter(f.key)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: searchTypeFilter === f.key ? '#1F4E78' : '#f1f5f9',
                    color: searchTypeFilter === f.key ? '#fff' : '#475569'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <input
              type="text"
              value={itemSearchText}
              onChange={(e) => setItemSearchText(e.target.value)}
              placeholder="શોધો (દા.ત. પ્રથમ શ્રી હરિને, ગઢડા પ્રથમ...)"
              autoFocus
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '6px',
                border: '1.5px solid #3b82f6',
                fontSize: '13px',
                marginBottom: '10px'
              }}
            />

            {/* Item List */}
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
              {filteredMasterItems.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                  કોઈ આઇટમ મળી નથી
                </div>
              ) : (
                filteredMasterItems.map((item, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      handleUpdateRow(searchTargetRowIndex, 'title', item.label);
                      setSearchTargetRowIndex(null);
                    }}
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '13px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#eff6ff'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{item.label}</span>
                      {item.sec && <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>({item.sec})</span>}
                    </div>
                    <span style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: item.type === 'વચનામૃત' ? '#fef3c7' : '#e0e7ff',
                      color: item.type === 'વચનામૃત' ? '#92400e' : '#3730a3',
                      fontWeight: 700
                    }}>
                      {item.type}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= PRINT AREA / LIVE PREVIEW ================= */}
      <div className="print-area-root">
        
        {/* On-screen Preview Info Bar */}
        <div className="no-print" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          background: '#f1f5f9',
          border: '1px solid #cbd5e1',
          padding: '10px 16px',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📄</span> A4 પ્રિન્ટ પ્રિવ્યૂ (કુલ {slipPages.length} પેજ — દરેક પેજ પર ૪ સ્લીપ)
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleExportExcel}
              style={{
                background: '#047857',
                color: '#ffffff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              📊 Excel ડાઉનલોડ (.xlsx)
            </button>
            <button
              type="button"
              onClick={handleOpenGoogleSheets}
              style={{
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              🟢 Google Sheets માં ખોલો
            </button>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                background: '#1F4E78',
                color: '#ffffff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              🖨️ પ્રિન્ટ વિન્ડો ખોલો
            </button>
          </div>
        </div>

        {/* Render each A4 Sheet (4 slips per sheet) */}
        {slipPages.map((pageSlips, pageIdx) => (
          <div key={pageIdx} className="a4-sheet-preview">
            
            {/* Visual dashed cutting guides on sheet */}
            <div className="cutting-guide-v"></div>
            <div className="cutting-guide-h"></div>

            {/* 4 Slips inside 2x2 Grid */}
            {pageSlips.map((slip, slipIdx) => (
              <div key={slip.id || slipIdx} className="slip-box">
                
                {/* 1. Header Banner */}
                <div className="slip-top-banner">
                  {slipTitle}
                </div>

                {/* 2. Sub-Banner (Month & Member Name) */}
                <div className="slip-sub-banner">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', maxWidth: '68%' }}>
                    <span style={{ color: '#1F4E78', fontWeight: 800 }}>પૂ.સંત/સાધક:</span>
                    <span style={{ fontWeight: 800, color: '#0f172a', borderBottom: '1px dashed #64748b', minWidth: '95px', paddingBottom: '1px' }}>
                      {slip.memberName || '____________________'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#1F4E78', fontWeight: 700 }}>માસ:</span>
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{monthText}</span>
                  </div>
                </div>

                {/* 3. Daily Content Table */}
                <table className="slip-table">
                  <thead>
                    <tr>
                      <th style={{ width: '7%' }}>ક્રમ</th>
                      <th style={{ width: '16%' }}>તારીખ</th>
                      <th style={{ width: '13%' }}>દિવસ</th>
                      <th style={{ width: '35%' }}>કીર્તન / વચનામૃતનું નામ</th>
                      <th style={{ width: '10%' }}>તપાસ (✓)</th>
                      <th style={{ width: '19%' }}>નોંધ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsData.map((row, rIdx) => (
                      <tr key={row.id || rIdx}>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: '#1F4E78' }}>
                          {rIdx + 1}
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 600 }}>
                          {row.date}
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {row.dayLabel}
                        </td>
                        <td style={{ paddingLeft: '6px', fontWeight: 600, color: '#1e293b' }}>
                          {row.title}
                        </td>
                        <td style={{ textAlign: 'center', padding: '0' }}>
                          <div style={{
                            display: 'inline-block',
                            width: '13px',
                            height: '13px',
                            border: '1.3px solid #334155',
                            borderRadius: '2px',
                            verticalAlign: 'middle',
                            background: '#ffffff'
                          }}></div>
                        </td>
                        <td style={{ paddingLeft: '6px', fontSize: '8.8pt', color: '#475569' }}>
                          {row.note}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

              </div>
            ))}

            {/* If the last page has less than 4 slips, fill empty placeholder slots to maintain grid */}
            {pageSlips.length < 4 && Array.from({ length: 4 - pageSlips.length }).map((_, emptyIdx) => (
              <div 
                key={`empty_${emptyIdx}`} 
                className="slip-box" 
                style={{ visibility: 'hidden', border: '1px dashed #cbd5e1' }}
              />
            ))}

          </div>
        ))}

      </div>

    </div>
  );
}
