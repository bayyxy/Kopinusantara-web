import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

function App() {
  const [transactions, setTransactions] = useState([]);
  const [filteredTx, setFilteredTx] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Default filter tanggal: 7 hari terakhir
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // State untuk metrik laporan
  const [summary, setSummary] = useState({ gross: 0, net: 0, cash: 0, qris: 0, count: 0 });
  const [menuStats, setMenuStats] = useState([]);

  useEffect(() => {
    fetchReportData();
  }, [startDate, endDate]);

  useEffect(() => {
    // Fitur Search (Mencari berdasarkan nama pelanggan atau ID nota)
    const lowercasedFilter = searchTerm.toLowerCase();
    const filteredData = transactions.filter(item => {
      return item.customer_name?.toLowerCase().includes(lowercasedFilter) ||
             item.id.toString().includes(lowercasedFilter);
    });
    setFilteredTx(filteredData);
  }, [searchTerm, transactions]);

  const fetchReportData = async () => {
    // Ambil data dari Supabase berdasarkan range tanggal (Awal hari s/d akhir hari)
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

    data.forEach(tx => {
      tGross += tx.total_amount;
      if (tx.payment_method === 'Tunai') tCash += tx.total_amount;
      if (tx.payment_method === 'QRIS') tQris += tx.total_amount;

      // Supabase mengembalikan JSONB sebagai Object/Array asli
      const items = typeof tx.items === 'string' ? JSON.parse(tx.items) : tx.items;

      if (items && Array.isArray(items)) {
        items.forEach(item => {
          // Kalkulasi Laba Bersih
          const cost = item.production_cost ? Number(item.production_cost) : 0;
          tModal += (cost * item.quantity);

          // Kalkulasi Menu Laris
          const itemName = item.variantText ? `${item.name} (${item.variantText})` : item.name;
          if (!itemAnalytics[itemName]) {
            itemAnalytics[itemName] = { name: itemName, qty: 0, revenue: 0 };
          }
          itemAnalytics[itemName].qty += item.quantity;
          itemAnalytics[itemName].revenue += (item.price * item.quantity);
        });
      }
    });

    setSummary({
      gross: tGross,
      net: tGross - tModal,
      cash: tCash,
      qris: tQris,
      count: data.length
    });

    // Urutkan menu dari yang paling laris ke kurang laris
    const sortedMenu = Object.values(itemAnalytics).sort((a, b) => b.qty - a.qty);
    setMenuStats(sortedMenu);
  };

  const formatRp = (angka) => 'Rp ' + (angka || 0).toLocaleString('id-ID');

  return (
    <div style={{ padding: '30px', fontFamily: 'sans-serif', backgroundColor: '#F1F5F9', minHeight: '100vh' }}>
      <h1 style={{ color: '#1E293B', marginBottom: '5px' }}>Dashboard Kedai Nusantara</h1>
      <p style={{ color: '#64748B', marginTop: '0', marginBottom: '30px' }}>Sistem Analitik & Laporan Penjualan</p>

      {/* FILTER TANGGAL & PENCARIAN */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '25px', flexWrap: 'wrap' }}>
        <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
          <label style={{ fontWeight: 'bold', marginRight: '10px' }}>Periode:</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: '5px' }} />
          <span style={{ margin: '0 10px' }}>s/d</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: '5px' }} />
        </div>
        <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #CBD5E1', flexGrow: 1 }}>
          <label style={{ fontWeight: 'bold', marginRight: '10px' }}>Cari Nota/Pelanggan:</label>
          <input
            type="text"
            placeholder="Ketik nama pelanggan..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: '6px', width: '250px' }}
          />
        </div>
      </div>

      {/* KARTU METRIK */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, backgroundColor: '#10B981', color: 'white', padding: '20px', borderRadius: '10px' }}>
          <h3>Pendapatan Kotor</h3>
          <h1 style={{ margin: '10px 0' }}>{formatRp(summary.gross)}</h1>
          <p style={{ margin: 0, fontSize: '14px', backgroundColor: 'rgba(0,0,0,0.2)', display: 'inline-block', padding: '4px 8px', borderRadius: '4px' }}>
            Laba Bersih: {formatRp(summary.net)}
          </p>
        </div>
        <div style={{ flex: 1, backgroundColor: '#3B82F6', color: 'white', padding: '20px', borderRadius: '10px' }}>
          <h3>Tunai (Cash di Laci)</h3>
          <h1 style={{ margin: '10px 0' }}>{formatRp(summary.cash)}</h1>
          <p style={{ margin: 0, fontSize: '14px' }}>Dari total {summary.count} transaksi</p>
        </div>
        <div style={{ flex: 1, backgroundColor: '#F59E0B', color: 'white', padding: '20px', borderRadius: '10px' }}>
          <h3>Saldo QRIS (Bank)</h3>
          <h1 style={{ margin: '10px 0' }}>{formatRp(summary.qris)}</h1>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        {/* TABEL TRANSAKSI KIRI */}
        <div style={{ flex: 2, backgroundColor: 'white', padding: '20px', borderRadius: '10px', border: '1px solid #CBD5E1' }}>
          <h2 style={{ marginTop: 0 }}>Riwayat Transaksi</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
              <tr>
                <th style={{ padding: '12px' }}>ID</th>
                <th style={{ padding: '12px' }}>Waktu</th>
                <th style={{ padding: '12px' }}>Pelanggan</th>
                <th style={{ padding: '12px' }}>Metode</th>
                <th style={{ padding: '12px' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredTx.length === 0 ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>Tidak ada transaksi</td></tr>
              ) : (
                filteredTx.map((tx) => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>#{tx.id}</td>
                    <td style={{ padding: '12px' }}>{new Date(tx.transaction_date).toLocaleString('id-ID')}</td>
                    <td style={{ padding: '12px' }}>{tx.customer_name}</td>
                    <td style={{ padding: '12px' }}>{tx.payment_method}</td>
                    <td style={{ padding: '12px', color: '#10B981', fontWeight: 'bold' }}>{formatRp(tx.total_amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ANALITIK MENU KANAN */}
        <div style={{ flex: 1, backgroundColor: 'white', padding: '20px', borderRadius: '10px', border: '1px solid #CBD5E1' }}>
          <h2 style={{ marginTop: 0 }}>Performa Menu</h2>
          {menuStats.length === 0 ? <p>Belum ada data penjualan.</p> : (
            <>
              <h4 style={{ color: '#10B981', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>📈 Terlaris</h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0' }}>
                {menuStats.slice(0, 5).map((menu, i) => (
                  <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed #eee' }}>
                    <span>{i+1}. {menu.name}</span>
                    <strong style={{ color: '#1E293B' }}>{menu.qty}x</strong>
                  </li>
                ))}
              </ul>

              <h4 style={{ color: '#EF4444', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>📉 Kurang Laris</h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {menuStats.slice(-5).reverse().map((menu, i) => (
                  <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed #eee' }}>
                    <span>{menu.name}</span>
                    <strong style={{ color: '#64748B' }}>{menu.qty}x</strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;