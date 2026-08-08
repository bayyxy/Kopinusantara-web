import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

function App() {
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    // Menarik data dari Supabase, diurutkan dari yang terbaru
    const { data, error } = await supabase
      .from('table_transactions')
      .select('*')
      .order('transaction_date', { ascending: false });

    if (error) {
      console.error('Gagal menarik data:', error.message);
    } else {
      setTransactions(data);
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1 style={{ color: '#1E293B' }}>Dashboard Kedai Nusantara</h1>
      <p>Riwayat transaksi langsung dari aplikasi kasir Android.</p>

      <table border="1" cellPadding="12" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '20px', textAlign: 'left' }}>
        <thead style={{ backgroundColor: '#10B981', color: 'white' }}>
          <tr>
            <th>Waktu Transaksi</th>
            <th>Pelanggan</th>
            <th>Metode</th>
            <th>Total (Rp)</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id} style={{ backgroundColor: '#F8FAFC' }}>
              <td>{new Date(tx.transaction_date).toLocaleString('id-ID')}</td>
              <td>{tx.customer_name}</td>
              <td>{tx.payment_method}</td>
              <td>{tx.total_amount.toLocaleString('id-ID')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;