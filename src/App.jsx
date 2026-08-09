import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import './App.css';

function App() {
  const [transactions, setTransactions] = useState([]);
  const [filteredTx, setFilteredTx] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Default filter: 30 Hari Terakhir agar analisis retensi pelanggan lebih akurat
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const [summary, setSummary] = useState({ gross: 0, net: 0, cash: 0, qris: 0, count: 0 });
  const [menuStats, setMenuStats] = useState([]);
  const [customerStats, setCustomerStats] = useState([]);
  const [hourlyStats, setHourlyStats] = useState([]);

  const [showAllMenu, setShowAllMenu] = useState(false);
  const [showAllCustomers, setShowAllCustomers] = useState(false);
  const [showPeakHours, setShowPeakHours] = useState(false);

  useEffect(() => {
    fetchReportData();
  }, [startDate, endDate]);

  useEffect(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    const filteredData = transactions.filter(item => {
      return item.customer_name?.toLowerCase().includes(lowercasedFilter) ||
             item.id.toString().includes(lowercasedFilter);
    });
    setFilteredTx(filteredData);
  }, [searchTerm, transactions]);

  const fetchReportData = async () => {
    const { data, error } = await supabase
      .from('table_transactions')
      .select('*')
      .gte('transaction_date', `${startDate}T00:00:00.000Z`)
      .lte('transaction_date', `${endDate}T23:59:59.999Z`)
      .order('transaction_date', { ascending: false });

    if (error) {
      console.error('Gagal menarik data:', error.message);
      return;
    }

    setTransactions(data);
    calculateMetrics(data);
  };

  const calculateMetrics = (data) => {
    let tGross = 0, tModal = 0, tCash = 0, tQris = 0;
    let itemAnalytics = {};
    let customerAnalytics = {};
    let hourAnalytics = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0, revenue: 0 }));

    const today = new Date(); // Untuk menghitung selisih hari

    data.forEach(tx => {
      tGross += tx.total_amount;
      if (tx.payment_method === 'Tunai') tCash += tx.total_amount;
      if (tx.payment_method === 'QRIS') tQris += tx.total_amount;

      const txDate = new Date(tx.transaction_date);
      const txHour = txDate.getUTCHours();
      hourAnalytics[txHour].count += 1;
      hourAnalytics[txHour].revenue += tx.total_amount;

      // --- LOGIKA PELANGGAN & RETENSI ---
      const cName = tx.customer_name || 'Tanpa Nama';
      if (!customerAnalytics[cName]) {
        customerAnalytics[cName] = { name: cName, visits: 0, spent: 0, lastVisit: txDate };
      }
      customerAnalytics[cName].visits += 1;
      customerAnalytics[cName].spent += tx.total_amount;

      // Update tanggal terakhir kedatangan jika transaksi ini lebih baru
      if (txDate > customerAnalytics[cName].lastVisit) {
        customerAnalytics[cName].lastVisit = txDate;
      }

      const items = typeof tx.items === 'string' ? JSON.parse(tx.items) : tx.items;
      if (items && Array.isArray(items)) {
        items.forEach(item => {
          const cost = item.production_cost ? Number(item.production_cost) : 0;
          tModal += (cost * item.quantity);

          const itemName = item.variantText ? `${item.name} (${item.variantText})` : item.name;
          if (!itemAnalytics[itemName]) {
            itemAnalytics[itemName] = { name: itemName, qty: 0, revenue: 0, profit: 0 };
          }
          itemAnalytics[itemName].qty += item.quantity;
          itemAnalytics[itemName].revenue += (item.price * item.quantity);
          itemAnalytics[itemName].profit += ((item.price - cost) * item.quantity);
        });
      }
    });

    setSummary({ gross: tGross, net: tGross - tModal, cash: tCash, qris: tQris, count: data.length });

    const sortedMenu = Object.values(itemAnalytics).sort((a, b) => b.qty - a.qty);
    setMenuStats(sortedMenu);

    // Finalisasi perhitungan hari absen pelanggan
    const finalCustomers = Object.values(customerAnalytics).map(cust => {
      const diffTime = Math.abs(today - cust.lastVisit);
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return { ...cust, daysAbsent: diffDays };
    });

    // Urutkan default berdasarkan kedatangan (untuk loyalitas)
    const sortedCustomers = finalCustomers.sort((a, b) => {
      if (b.visits === a.visits) return b.spent - a.spent;
      return b.visits - a.visits;
    });

    setCustomerStats(sortedCustomers);
    setHourlyStats(hourAnalytics);
  };

  const formatRp = (angka) => 'Rp ' + (angka || 0).toLocaleString('id-ID');

  const maxHourCount = hourlyStats.length > 0 ? Math.max(...hourlyStats.map(h => h.count)) : 0;

  // Filter khusus pelanggan yang berisiko hilang (Datang > 1 kali, tapi absen >= 7 hari)
  const atRiskCustomers = [...customerStats]
    .filter(c => c.visits > 1 && c.daysAbsent >= 7 && c.name !== 'Tanpa Nama')
    .sort((a, b) => b.daysAbsent - a.daysAbsent);

  return (
    <div className="dashboard-container">
      <h1 className="header-title">Dashboard Kedai Nusantara</h1>
      <p className="header-subtitle">Sistem Analitik & Laporan Penjualan</p>

      <div className="filter-section">
        <div className="filter-card">
          <label>Periode:</label>
          <input type="date" className="filter-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <span>s/d</span>
          <input type="date" className="filter-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="filter-card">
          <label>Cari Nota:</label>
          <input
            type="text"
            className="filter-input"
            placeholder="Ketik nama pelanggan / ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card" style={{ backgroundColor: 'var(--primary)' }}>
          <h3>Pendapatan Kotor</h3>
          <h1>{formatRp(summary.gross)}</h1>
          <p className="metric-sub">Laba Bersih: {formatRp(summary.net)}</p>
        </div>
        <div className="metric-card" style={{ backgroundColor: 'var(--secondary)' }}>
          <h3>Tunai (Cash di Laci)</h3>
          <h1>{formatRp(summary.cash)}</h1>
          <p className="metric-sub">Dari total {summary.count} transaksi</p>
        </div>
        <div className="metric-card" style={{ backgroundColor: 'var(--warning)' }}>
          <h3>Saldo QRIS (Bank)</h3>
          <h1>{formatRp(summary.qris)}</h1>
        </div>
      </div>

      <div className="content-grid">
        {/* KOLOM KIRI */}
        <div className="content-card table-section">
          <h2>Riwayat Transaksi</h2>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Waktu</th>
                  <th>Pelanggan</th>
                  <th>Metode</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredTx.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center' }}>Tidak ada transaksi di periode ini</td></tr>
                ) : (
                  filteredTx.map((tx) => (
                    <tr key={tx.id}>
                      <td style={{ fontWeight: 'bold' }}>#{tx.id}</td>
                      <td>{new Date(tx.transaction_date).toLocaleString('id-ID', { timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td>{tx.customer_name}</td>
                      <td>
                        <span style={{
                          backgroundColor: tx.payment_method === 'QRIS' ? '#FEF3C7' : '#DBEAFE',
                          color: tx.payment_method === 'QRIS' ? '#D97706' : '#2563EB',
                          padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold'
                        }}>
                          {tx.payment_method}
                        </span>
                      </td>
                      <td style={{ color: 'var(--primary-dark)', fontWeight: 'bold' }}>{formatRp(tx.total_amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* KOLOM KANAN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>

          <div className="content-card">
            <h2>Jam Sibuk (Peak Hours)</h2>
            {hourlyStats.filter(h => h.count > 0).length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Belum ada transaksi.</p> : (
              <>
                <ul className="menu-list">
                  {[...hourlyStats]
                    .filter(h => h.count > 0)
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 3)
                    .map((h, i) => (
                      <li key={i} className="menu-item" style={{ alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: 'bold', display: 'block' }}>Pukul {h.hour.toString().padStart(2, '0')}:00</span>
                        </div>
                        <strong style={{ color: 'var(--warning)', fontSize: '1.1rem' }}>{h.count} Transaksi</strong>
                      </li>
                    ))}
                </ul>
                <button className="view-all-btn" onClick={() => setShowPeakHours(true)}>
                  Lihat Grafik 24 Jam
                </button>
              </>
            )}
          </div>

          <div className="content-card">
            <h2>Analisis Menu</h2>
            {menuStats.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Belum ada penjualan.</p> : (
              <>
                <h4 className="section-label" style={{ color: 'var(--primary-dark)' }}>📈 Paling Laris</h4>
                <ul className="menu-list">
                  {menuStats.slice(0, 3).map((menu, i) => (
                    <li key={`qty-${i}`} className="menu-item">
                      <span>{i+1}. {menu.name}</span>
                      <strong style={{ color: 'var(--dark)' }}>{menu.qty}x</strong>
                    </li>
                  ))}
                </ul>
                <button className="view-all-btn" onClick={() => setShowAllMenu(true)}>
                  Lihat Analisis Semua Menu
                </button>
              </>
            )}
          </div>

          {/* FITUR BARU: KARTU ANALISIS PELANGGAN & RETENSI */}
          <div className="content-card">
            <h2>Analisis Pelanggan</h2>
            {customerStats.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Belum ada data pelanggan.</p> : (
              <>
                <h4 className="section-label" style={{ color: 'var(--secondary)' }}>🏆 Teratas</h4>
                <ul className="menu-list">
                  {customerStats.filter(c => c.name !== 'Tanpa Nama').slice(0, 3).map((cust, i) => (
                    <li key={i} className="menu-item" style={{ alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: 'bold', display: 'block' }}>{i+1}. {cust.name}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{cust.daysAbsent === 0 ? 'Hari ini datang' : `${cust.daysAbsent} hari lalu`}</span>
                      </div>
                      <strong style={{ color: 'var(--secondary)', fontSize: '1.1rem' }}>{cust.visits}x</strong>
                    </li>
                  ))}
                </ul>

                {atRiskCustomers.length > 0 && (
                  <>
                    <h4 className="section-label" style={{ color: '#EF4444', marginTop: '15px' }}>⚠️ Berisiko Hilang (Lama Absen)</h4>
                    <ul className="menu-list">
                      {atRiskCustomers.slice(0, 3).map((cust, i) => (
                        <li key={`risk-${i}`} className="menu-item" style={{ alignItems: 'center' }}>
                          <div>
                            <span style={{ fontWeight: 'bold', display: 'block' }}>{cust.name}</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pernah datang {cust.visits}x</span>
                          </div>
                          <strong style={{ color: '#EF4444' }}>{cust.daysAbsent} hari</strong>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <button className="view-all-btn" onClick={() => setShowAllCustomers(true)}>
                  Lihat Database Pelanggan
                </button>
              </>
            )}
          </div>

        </div>
      </div>

      {/* MODAL GRAFIK JAM SIBUK */}
      {showPeakHours && (
        <div className="modal-overlay" onClick={() => setShowPeakHours(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Grafik Transaksi 24 Jam</h2>
              <button className="close-btn" onClick={() => setShowPeakHours(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ padding: '10px 0' }}>
              {hourlyStats.map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ width: '45px', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                    {h.hour.toString().padStart(2, '0')}:00
                  </div>
                  <div style={{ flex: 1, backgroundColor: 'var(--bg-color)', height: '16px', borderRadius: '4px', overflow: 'hidden', margin: '0 15px' }}>
                     <div style={{ width: `${maxHourCount === 0 ? 0 : (h.count / maxHourCount) * 100}%`, backgroundColor: h.count === maxHourCount ? 'var(--warning)' : 'var(--secondary)', height: '100%', transition: 'width 0.5s ease-in-out' }}></div>
                  </div>
                  <div style={{ width: '30px', textAlign: 'left', fontSize: '0.85rem', fontWeight: 'bold', color: h.count > 0 ? 'var(--dark)' : 'var(--border-color)' }}>{h.count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL MENU */}
      {showAllMenu && (
        <div className="modal-overlay" onClick={() => setShowAllMenu(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Detail Profitabilitas Menu</h2>
              <button className="close-btn" onClick={() => setShowAllMenu(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1, padding: '12px 0' }}>Nama Menu</th>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1, textAlign: 'center', padding: '12px 0' }}>Terjual</th>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1, textAlign: 'right', padding: '12px 0' }}>Total Omzet</th>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1, textAlign: 'right', padding: '12px 0' }}>Laba Bersih</th>
                  </tr>
                </thead>
                <tbody>
                  {menuStats.map((menu, i) => (
                    <tr key={i}>
                      <td style={{ padding: '12px 0', borderBottom: '1px solid #eee' }}>{menu.name}</td>
                      <td style={{ padding: '12px 0', borderBottom: '1px solid #eee', textAlign: 'center', fontWeight: 'bold' }}>{menu.qty}</td>
                      <td style={{ padding: '12px 0', borderBottom: '1px solid #eee', textAlign: 'right', color: 'var(--primary-dark)', fontWeight: '500' }}>{formatRp(menu.revenue)}</td>
                      <td style={{ padding: '12px 0', borderBottom: '1px solid #eee', textAlign: 'right', color: '#F59E0B', fontWeight: 'bold' }}>{formatRp(menu.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PELANGGAN DENGAN FITUR TERAKHIR DATANG */}
      {showAllCustomers && (
        <div className="modal-overlay" onClick={() => setShowAllCustomers(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Database Pelanggan</h2>
              <button className="close-btn" onClick={() => setShowAllCustomers(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1, padding: '12px 0' }}>Nama</th>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1, textAlign: 'center', padding: '12px 0' }}>Kedatangan</th>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1, textAlign: 'right', padding: '12px 0' }}>Terakhir Datang</th>
                  </tr>
                </thead>
                <tbody>
                  {customerStats.map((cust, i) => (
                    <tr key={i}>
                      <td style={{ padding: '12px 0', borderBottom: '1px solid #eee' }}>
                        {cust.name}
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Belanja: {formatRp(cust.spent)}</div>
                      </td>
                      <td style={{ padding: '12px 0', borderBottom: '1px solid #eee', textAlign: 'center', fontWeight: 'bold', color: 'var(--secondary)' }}>{cust.visits}x</td>
                      <td style={{ padding: '12px 0', borderBottom: '1px solid #eee', textAlign: 'right', color: cust.daysAbsent >= 7 ? '#EF4444' : 'var(--dark)' }}>
                        {cust.daysAbsent === 0 ? 'Hari ini' : `${cust.daysAbsent} hari lalu`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;