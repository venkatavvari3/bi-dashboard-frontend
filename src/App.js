import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

import React, { useState, useEffect } from "react";
import { Container, Navbar, Button, Spinner, Alert } from "react-bootstrap";
import { Bar } from "react-chartjs-2";
import axios from "axios";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

const API_URL = process.env.REACT_APP_API_URL || "";

function Dashboard({ token, onLogout }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = async () => {
    try {
      setLoading(true);
      const resp = await axios.get(`${API_URL}/api/data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(resp.data);
      setError("");
    } catch (err) {
      setError("Failed to fetch data");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, "dashboard_data.xlsx");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Dashboard Data", 10, 10);
    data.forEach((row, i) => {
      doc.text(JSON.stringify(row), 10, 20 + i * 10);
    });
    doc.save("dashboard_data.pdf");
  };

  if (loading) return <Spinner animation="border" />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <Container>
      <h1 className="mt-3">Interactive Dashboard</h1>
      <Bar data={{
        labels: data.map(r => r.label),
        datasets: [{
          label: 'Value',
          data: data.map(r => r.value),
          backgroundColor: 'rgba(54, 162, 235, 0.6)'
        }]
      }} />
      <div className="my-3">
        <Button onClick={exportExcel} className="me-2">Export Excel</Button>
        <Button onClick={exportPDF} className="me-2">Export PDF</Button>
        <Button variant="outline-secondary" onClick={onLogout}>Logout</Button>
      </div>
    </Container>
  );
}

function Login({ setToken }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');

  const login = async () => {
    try {
      const resp = await axios.post(`${API_URL}/api/login`, { username: user, password: pass });
      setToken(resp.data.access_token);
      setError('');
    } catch (e) {
      setError('Invalid credentials');
    }
  };
  return (
    <Container className="mt-5" style={{ maxWidth: 400 }}>
      <h2>Login</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      <input
        className="form-control my-2"
        placeholder="Username"
        value={user}
        onChange={e => setUser(e.target.value)}
      />
      <input
        className="form-control my-2"
        placeholder="Password"
        type="password"
        value={pass}
        onChange={e => setPass(e.target.value)}
      />
      <Button onClick={login} className="w-100">Login</Button>
    </Container>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  useEffect(() => {
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  }, [token]);
  return (
    <>
      <Navbar bg="dark" variant="dark">
        <Container>
          <Navbar.Brand>BI Dashboard</Navbar.Brand>
        </Container>
      </Navbar>
      {token ? <Dashboard token={token} onLogout={() => setToken('')} /> : <Login setToken={setToken} />}
    </>
  );
}