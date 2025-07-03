import React, { useState, useEffect, useRef } from "react";
import { Container, Navbar, Button, Spinner, Alert, Table, Form, Row, Col, Card } from "react-bootstrap";
import * as d3 from "d3";
import axios from "axios";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { jwtDecode } from "jwt-decode";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { Canvg } from "canvg"; // <-- added for svg to canvas

const API_URL = process.env.REACT_APP_API_URL || "";
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "";

function useD3Chart(drawFn, data, dependencies) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = "";
      drawFn(ref.current, data);
    }
    // eslint-disable-next-line
  }, dependencies);
  return ref;
}

function drawBarChart(container, { labels, values }) {
  const width = 350, height = 200, margin = { top: 20, right: 10, bottom: 40, left: 40 };
  const svg = d3.select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const x = d3.scaleBand().domain(labels).range([margin.left, width - margin.right]).padding(0.2);
  const y = d3.scaleLinear().domain([0, d3.max(values)]).nice().range([height - margin.bottom, margin.top]);
  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));
  svg.selectAll(".bar")
    .data(values)
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", (_, i) => x(labels[i]))
    .attr("width", x.bandwidth())
    .attr("y", d => y(d))
    .attr("height", d => y(0) - y(d))
    .attr("fill", "#36a2eb");
}

function drawPieChart(container, { labels, values, colors }) {
  const width = 350, height = 200, radius = Math.min(width, height) / 2 - 10;
  const svg = d3.select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);
  const pie = d3.pie()(values);
  const arc = d3.arc().innerRadius(0).outerRadius(radius);
  svg.selectAll("path")
    .data(pie)
    .enter()
    .append("path")
    .attr("d", arc)
    .attr("fill", (_, i) => colors[i % colors.length])
    .attr("stroke", "#fff")
    .attr("stroke-width", 1);
  svg.selectAll("text")
    .data(pie)
    .enter()
    .append("text")
    .text((d, i) => labels[i])
    .attr("transform", d => `translate(${arc.centroid(d)})`)
    .attr("text-anchor", "middle")
    .attr("font-size", "10px");
}

function drawLineChart(container, { labels, values }) {
  const width = 350, height = 200, margin = { top: 20, right: 10, bottom: 40, left: 40 };
  const svg = d3.select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const x = d3.scalePoint().domain(labels).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, d3.max(values)]).nice().range([height - margin.bottom, margin.top]);
  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));
  const line = d3.line()
    .x((_, i) => x(labels[i]))
    .y(d => y(d));
  svg.append("path")
    .datum(values)
    .attr("fill", "none")
    .attr("stroke", "#36a2eb")
    .attr("stroke-width", 2)
    .attr("d", line);
}

function drawDoughnutChart(container, { labels, values, colors }) {
  const width = 350, height = 200, radius = Math.min(width, height) / 2 - 10;
  const svg = d3.select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);
  const pie = d3.pie()(values);
  const arc = d3.arc().innerRadius(radius * 0.5).outerRadius(radius);
  svg.selectAll("path")
    .data(pie)
    .enter()
    .append("path")
    .attr("d", arc)
    .attr("fill", (_, i) => colors[i % colors.length])
    .attr("stroke", "#fff")
    .attr("stroke-width", 1);
  svg.selectAll("text")
    .data(pie)
    .enter()
    .append("text")
    .text((d, i) => labels[i])
    .attr("transform", d => `translate(${arc.centroid(d)})`)
    .attr("text-anchor", "middle")
    .attr("font-size", "10px");
}

// SVG to PNG helper using canvg
const svgToPngDataUrl = async (svgElement) => {
  const width = svgElement.width.baseVal.value || 400;
  const height = svgElement.height.baseVal.value || 200;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const v = await Canvg.from(ctx, svgElement.outerHTML);
  await v.render();
  return canvas.toDataURL('image/png');
};

function Dashboard({ token, onLogout, persona, loginName }) {
  const [data, setData] = useState([]);
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedStore, setSelectedStore] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const barRef = useD3Chart(
    drawBarChart,
    {
      labels: [...new Set(data.filter(row =>
        (selectedProduct ? row.product_name === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      ).map(row => row.product_name))],
      values: [...new Set(data.filter(row =>
        (selectedProduct ? row.product_name === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      ).map(row => row.product_name))].map(
        p => data.filter(row =>
          (selectedProduct ? row.product_name === selectedProduct : true) &&
          (selectedStore ? row.store_name === selectedStore : true) &&
          row.product_name === p
        ).reduce((a, b) => a + Number(b.revenue), 0)
      )
    },
    [data, selectedProduct, selectedStore]
  );

  const pieColors = ["#ff6384", "#ffce56", "#36a2eb", "#9966ff", "#4bc0c0"];
  const pieRef = useD3Chart(
    drawPieChart,
    {
      labels: [...new Set(data.filter(row =>
        (selectedProduct ? row.product_name === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      ).map(row => row.store_name))],
      values: [...new Set(data.filter(row =>
        (selectedProduct ? row.product_name === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      ).map(row => row.store_name))].map(
        s => data.filter(row =>
          (selectedProduct ? row.product_name === selectedProduct : true) &&
          (selectedStore ? row.store_name === selectedStore : true) &&
          row.store_name === s
        ).reduce((a, b) => a + Number(b.revenue), 0)
      ),
      colors: pieColors
    },
    [data, selectedProduct, selectedStore]
  );

  const lineRef = useD3Chart(
    drawLineChart,
    {
      labels: [...new Set(data.filter(row =>
        (selectedProduct ? row.product_name === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      ).map(row => row.date))].sort(),
      values: [...new Set(data.filter(row =>
        (selectedProduct ? row.product_name === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      ).map(row => row.date))].sort().map(
        d => data.filter(row =>
          (selectedProduct ? row.product_name === selectedProduct : true) &&
          (selectedStore ? row.store_name === selectedStore : true) &&
          row.date === d
        ).reduce((a, b) => a + Number(b.revenue), 0)
      )
    },
    [data, selectedProduct, selectedStore]
  );

  const doughnutColors = ["#ff6384", "#ffce56", "#36a2eb", "#4bc0c0"];
  const doughnutRef = useD3Chart(
    drawDoughnutChart,
    {
      labels: [...new Set(data.filter(row =>
        (selectedProduct ? row.product_name === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      ).map(row => row.category))],
      values: [...new Set(data.filter(row =>
        (selectedProduct ? row.product_name === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      ).map(row => row.category))].map(
        c => data.filter(row =>
          (selectedProduct ? row.product_name === selectedProduct : true) &&
          (selectedStore ? row.store_name === selectedStore : true) &&
          row.category === c
        ).reduce((a, b) => a + Number(b.units_sold), 0)
      ),
      colors: doughnutColors
    },
    [data, selectedProduct, selectedStore]
  );

  const tableRef = useRef();

  // Fetch products and stores
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
  }, [token]);

  const filteredData = data.filter(row =>
    (selectedProduct ? row.product_name === selectedProduct : true) &&
    (selectedStore ? row.store_name === selectedStore : true)
  );

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

  const exportPDF = async () => {
    const doc = new jsPDF("p", "pt", "a4");
    const margin = 40;
    let y = margin;

    doc.setFontSize(12);
    doc.text(
      `Filters: Product = ${selectedProduct || "All"}, Store = ${selectedStore || "All"}`,
      margin,
      y
    );
    y += 20;

    // Use canvg to convert SVG to PNG for PDF export
    const addChartToPDF = async (chartRef, title) => {
      if (chartRef.current) {
        const chartSvg = chartRef.current.querySelector("svg");
        if (chartSvg) {
          const chartImg = await svgToPngDataUrl(chartSvg);
          doc.text(title, margin, y);
          y += 10;
          doc.addImage(chartImg, "PNG", margin, y, 250, 120);
          y += 130;
        }
      }
    };

    await addChartToPDF(lineRef, "Total Revenue Over Time");
    await addChartToPDF(barRef, "Revenue by Product");
    await addChartToPDF(pieRef, "Revenue by Store");
    await addChartToPDF(doughnutRef, "Units Sold by Category");

    // Export table as image (still using html2canvas, tables are fine)
    if (tableRef.current) {
      const tableCanvas = await html2canvas(tableRef.current, { scale: 2 });
      const tableImg = tableCanvas.toDataURL("image/png", 1.0);
      if (y + 220 > doc.internal.pageSize.getHeight()) {
        doc.addPage();
        y = margin;
      }
      doc.text("Sales Table", margin, y);
      y += 10;
      doc.addImage(tableImg, "PNG", margin, y, 500, 200);
    }

    doc.save("dashboard_sales.pdf");
  };

  const handleEmailMe = async () => {
    try {
      const canvas = await html2canvas(document.body);
      const imageData = canvas.toDataURL("image/png");
      await axios.post(`${API_URL}/api/email_me`, {
        message: "Here is the dashboard image",
        image: imageData
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert("Dashboard emailed!");
    } catch (e) {
      alert("Failed to send email");
    }
  };

  if (loading) return <Spinner animation="border" />;

  return (
    <Container>
      <h1 className="mt-3">Sales Dashboard</h1>
      <div className="mb-3" style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#1a73e8' }}>
        Logged in as: {loginName} {persona && <>({persona})</>}
      </div>
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
          <Button onClick={handleEmailMe} className="me-2" size="sm" variant="info">Email me</Button>
          <Button variant="outline-secondary" onClick={onLogout} size="sm">Logout</Button>
        </Col>
      </Row>

      {/* First Row: Line and Bar */}
      <Row>
        <Col md={6} className="mb-4">
          <Card>
            <Card.Body>
              <div ref={lineRef}></div>
            </Card.Body>
            <Card.Footer className="text-center">Total Revenue Over Time</Card.Footer>
          </Card>
        </Col>
        <Col md={6} className="mb-4">
          <Card>
            <Card.Body>
              <div ref={barRef}></div>
            </Card.Body>
            <Card.Footer className="text-center">Revenue by Product</Card.Footer>
          </Card>
        </Col>
      </Row>
      {/* Second Row: Pie and Doughnut */}
      <Row>
        <Col md={6} className="mb-4">
          <Card>
            <Card.Body>
              <div ref={pieRef}></div>
            </Card.Body>
            <Card.Footer className="text-center">Revenue by Store</Card.Footer>
          </Card>
        </Col>
        <Col md={6} className="mb-4">
          <Card>
            <Card.Body>
              <div ref={doughnutRef}></div>
            </Card.Body>
            <Card.Footer className="text-center">Units Sold by Category</Card.Footer>
          </Card>
        </Col>
      </Row>

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
  const [persona, setPersona] = useState("");
  const [loginName, setLoginName] = useState("");
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      try {
        const decoded = jwtDecode(token);
        setPersona(decoded.persona || "");
        setLoginName(decoded.sub || "");
      } catch (e) {
        setPersona("");
        setLoginName("");
      }
    } else {
      localStorage.removeItem('token');
      setPersona("");
      setLoginName("");
    }
  }, [token]);
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <Navbar bg="dark" variant="dark">
        <Container>
          <Navbar.Brand>BI Dashboard</Navbar.Brand>
          {persona && (
            <Navbar.Text style={{ color: "#FFD700" }}>
              &nbsp;Persona: <b>{persona}</b>
            </Navbar.Text>
          )}
        </Container>
      </Navbar>
      {token
        ? <Dashboard token={token} onLogout={() => setToken('')} persona={persona} loginName={loginName} />
        : <Login setToken={setToken} />}
    </GoogleOAuthProvider>
  );
}