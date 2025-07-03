import React, { useState, useEffect, useRef } from "react";
import { Container, Navbar, Button, Spinner, Alert, Table, Form, Row, Col } from "react-bootstrap";
import { Bar } from "react-chartjs-2";
import axios from "axios";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const API_URL = process.env.REACT_APP_API_URL || "";
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || ""; // Set this in your .env

function Dashboard({ token, onLogout }) {
  const [data, setData] = useState([]);
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedStore, setSelectedStore] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add refs for chart and table
  const chartRef = useRef();
  const tableRef = useRef();

  // Fetch filters
  useEffect(() => {
    axios.get(`${API_URL}/api/products`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setProducts(res.data))
      .catch(() => setProducts([]));
    axios.get(`${API_URL}/api/stores`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setStores(res.data))
      .catch(() => setStores([]));
  }, [token]);

  // Fetch data
  const fetchData = () => {
    setLoading(true);
    axios.get(`${API_URL}/api/data`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        setData(res.data);
        setError("");
      })
      .catch(() => setError("Failed to fetch data"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line
  }, [token]);

  // Filtering
  const filteredData = data.filter(row =>
    (selectedProduct ? row.product_name === selectedProduct : true) &&
    (selectedStore ? row.store_name === selectedStore : true)
  );

  // Export Excel: filtered table + filter info as first row
  const exportExcel = () => {
    const filterRow = {
      Date: "",
      Product: selectedProduct || "All",
      Category: "",
      Store: selectedStore || "All",
      Customer: "",
      "Units Sold": "",
      Revenue: "",
      Profit: ""
    };
    const ws = XLSX.utils.json_to_sheet([filterRow, ...filteredData]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales");
    XLSX.writeFile(wb, "dashboard_sales.xlsx");
  };

  // Export PDF: chart image + table (as seen) + filter info
  const exportPDF = async () => {
    const doc = new jsPDF("p", "pt", "a4");
    const margin = 40;
    let y = margin;

    // Add filter info
    doc.setFontSize(12);
    doc.text(
      `Filters: Product = ${selectedProduct || "All"}, Store = ${selectedStore || "All"}`,
      margin,
      y
    );
    y += 20;

    // Export chart as image
    const chartCanvas = chartRef.current.querySelector("canvas");
    const chartImg = chartCanvas.toDataURL("image/png", 1.0);
    doc.text("Sales Chart", margin, y);
    y += 10;
    doc.addImage(chartImg, "PNG", margin, y, 500, 200);
    y += 210;

    // Export table as image
    const tableElement = tableRef.current;
    const tableCanvas = await html2canvas(tableElement, { scale: 2 });
    const tableImg = tableCanvas.toDataURL("image/png", 1.0);

    if (y + 220 > doc.internal.pageSize.getHeight()) {
      doc.addPage();
      y = margin;
    }
    doc.text("Sales Table", margin, y);
    y += 10;
    doc.addImage(tableImg, "PNG", margin, y, 500, 200);

    doc.save("dashboard_sales.pdf");
  };

  // Chart data
  const chartData = {
    labels: filteredData.map(row => `${row.date} - ${row.product_name}`),
    datasets: [
      {
        label: "Revenue",
        data: filteredData.map(row => Number(row.revenue)),
        backgroundColor: "rgba(54, 162, 235, 0.6)"
      }
    ]
  };

  if (loading) return <Spinner animation="border" />;

  return (
    <Container>
      <h1 className="mt-3">Sales Dashboard</h1>
      {error && <Alert variant="danger">{error}</Alert>}

      <Row className="my-3">
        <Col md={4}>
          <Form.Select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
            <option value="">All Products</option>
            {products.map(p => (
              <option key={p.product_id} value={p.product_name}>{p.product_name}</option>
            ))}
          </Form.Select>
        </Col>
        <Col md={4}>
          <Form.Select value={selectedStore} onChange={e => setSelectedStore(e.target.value)}>
            <option value="">All Stores</option>
            {stores.map(s => (
              <option key={s.store_id} value={s.store_name}>{s.store_name}</option>
            ))}
          </Form.Select>
        </Col>
        <Col md={4} className="text-end">
          <Button onClick={exportExcel} className="me-2" size="sm">Export Excel</Button>
          <Button onClick={exportPDF} className="me-2" size="sm">Export PDF</Button>
          <Button variant="outline-secondary" onClick={onLogout} size="sm">Logout</Button>
        </Col>
      </Row>

      <div ref={chartRef}>
        <Bar data={chartData} />
      </div>

      <div ref={tableRef}>
        <Table striped bordered hover size="sm" className="mt-4">
          <thead>
            <tr>
              <th>Date</th>
              <th>Product</th>
              <th>Category</th>
              <th>Store</th>
              <th>Customer</th>
              <th>Units Sold</th>
              <th>Revenue</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row, idx) => (
              <tr key={idx}>
                <td>{row.date}</td>
                <td>{row.product_name}</td>
                <td>{row.category}</td>
                <td>{row.store_name}</td>
                <td>{row.customer_name}</td>
                <td>{row.units_sold}</td>
                <td>{row.revenue}</td>
                <td>{row.profit}</td>
              </tr>
            ))}
          </tbody>
        </Table>
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

  // Google Login handler
  const onGoogleSuccess = async (credentialResponse) => {
    try {
      const resp = await axios.post(`${API_URL}/api/login`, { credential: credentialResponse.credential });
      setToken(resp.data.access_token);
      setError('');
    } catch (e) {
      setError('Google login failed');
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
      <Button onClick={login} className="w-100 mb-2">Login</Button>
      <div className="my-2 text-center">or</div>
      {/* Google Login Button */}
      <GoogleLogin
        onSuccess={onGoogleSuccess}
        onError={() => setError("Google login failed")}
        width="100%"
      />
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
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <Navbar bg="dark" variant="dark">
        <Container>
          <Navbar.Brand>BI Dashboard</Navbar.Brand>
        </Container>
      </Navbar>
      {token ? <Dashboard token={token} onLogout={() => setToken('')} /> : <Login setToken={setToken} />}
    </GoogleOAuthProvider>
  );
}