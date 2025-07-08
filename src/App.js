import React, { useState, useEffect, useRef } from "react";
import { Container, Navbar, Button, Spinner, Alert, Table, Form, Row, Col, Card, Nav } from "react-bootstrap";
import * as d3 from "d3";
import axios from "axios";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { jwtDecode } from "jwt-decode";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { Canvg } from "canvg";
import ExcelJS from "exceljs";
import { saveAs } from 'file-saver';
import autoTable from "jspdf-autotable";

const API_URL = process.env.REACT_APP_API_URL || "";
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "";

// --- Example: add more dashboards here as components if you want ---
function SalesDashboard(props) {
  return <Dashboard {...props} />;
}
function PizzeriaDashboard(props) {
  //return <PPDashboard {...props} />;
  return (
    <Container className="mt-4">
      <h2>Pizzeria Dashboard (Coming Soon)</h2>
      <p>This is a placeholder for another dashboard view. Add your charts/tables here.</p>
    </Container>
  );
}

function CustomersDashboard(props) {
  return (
    <Container className="mt-4">
      <h2>Customers Dashboard (Coming Soon)</h2>
      <p>This is a placeholder for another dashboard view. Add your charts/tables here.</p>
    </Container>
  );
}

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

// --- Chart Drawing Functions (99% of parent size) ---
function drawBarChart(container, { labels, values }) {
  const width = (container.offsetWidth || 320) * 0.99;
  const height = (container.offsetHeight || 200) * 0.99;
  const margin = { top: 24, right: 16, bottom: 44, left: 48 };
  d3.select(container).selectAll("*").remove();
  const svg = d3.select(container)
    .append("svg")
    .attr("width", "99%")
    .attr("height", "99%")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMinYMin meet")
    .style("display", "block")
    .style("margin", "0 auto");

  const x = d3.scaleBand().domain(labels).range([margin.left, width - margin.right]).padding(0.2);
  const y = d3.scaleLinear().domain([0, d3.max(values) || 1]).nice().range([height - margin.bottom, margin.top]);
  const g = svg.append("g");

  g.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .selectAll("text").style("font-size", "11px");
  g.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y))
    .selectAll("text").style("font-size", "11px");

  g.selectAll(".bar")
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
  const width = (container.offsetWidth || 320) * 0.99;
  const height = (container.offsetHeight || 200) * 0.99;
  const radius = Math.min(width, height) / 2 - 10;
  d3.select(container).selectAll("*").remove();
  const svg = d3.select(container)
    .append("svg")
    .attr("width", "99%")
    .attr("height", "99%")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("display", "block");
  const g = svg.append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);

  const pie = d3.pie()(values);
  const arc = d3.arc().innerRadius(0).outerRadius(radius);
  g.selectAll("path")
    .data(pie)
    .enter()
    .append("path")
    .attr("d", arc)
    .attr("fill", (_, i) => colors[i % colors.length])
    .attr("stroke", "#fff")
    .attr("stroke-width", 1);
  g.selectAll("text")
    .data(pie)
    .enter()
    .append("text")
    .text((d, i) => labels[i])
    .attr("transform", d => `translate(${arc.centroid(d)})`)
    .attr("text-anchor", "middle")
    .attr("font-size", Math.max(Math.min(width, height) / 24, 10));
}

function drawLineChart(container, { labels, values }) {
  const width = (container.offsetWidth || 320) * 0.99;
  const height = (container.offsetHeight || 200) * 0.99;
  const margin = { top: 24, right: 16, bottom: 44, left: 48 };
  d3.select(container).selectAll("*").remove();
  const svg = d3.select(container)
    .append("svg")
    .attr("width", "99%")
    .attr("height", "99%")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMinYMin meet")
    .style("display", "block");

  const x = d3.scalePoint().domain(labels).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, d3.max(values) || 1]).nice().range([height - margin.bottom, margin.top]);
  const g = svg.append("g");

  g.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .selectAll("text").style("font-size", "11px");
  g.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y))
    .selectAll("text").style("font-size", "11px");

  const line = d3.line()
    .x((_, i) => x(labels[i]))
    .y(d => y(d));
  g.append("path")
    .datum(values)
    .attr("fill", "none")
    .attr("stroke", "#36a2eb")
    .attr("stroke-width", 2)
    .attr("d", line);
}

function drawDoughnutChart(container, { labels, values, colors }) {
  const width = (container.offsetWidth || 320) * 0.99;
  const height = (container.offsetHeight || 200) * 0.99;
  const radius = Math.min(width, height) / 2 - 10;
  d3.select(container).selectAll("*").remove();
  const svg = d3.select(container)
    .append("svg")
    .attr("width", "99%")
    .attr("height", "99%")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("display", "block");
  const g = svg.append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);

  const pie = d3.pie()(values);
  const arc = d3.arc().innerRadius(radius * 0.5).outerRadius(radius);
  g.selectAll("path")
    .data(pie)
    .enter()
    .append("path")
    .attr("d", arc)
    .attr("fill", (_, i) => colors[i % colors.length])
    .attr("stroke", "#fff")
    .attr("stroke-width", 1);
  g.selectAll("text")
    .data(pie)
    .enter()
    .append("text")
    .text((d, i) => labels[i])
    .attr("transform", d => `translate(${arc.centroid(d)})`)
    .attr("text-anchor", "middle")
    .attr("font-size", Math.max(Math.min(width, height) / 24, 10));
}

function drawTreemap(container, data) {
  const width = (container.offsetWidth || 320) * 0.99;
  const height = (container.offsetHeight || 200) * 0.99;

  d3.select(container).selectAll("*").remove();

  const svg = d3.select(container)
    .append("svg")
    .attr("width", "99%")
    .attr("height", "99%")
    .attr("viewBox", [0, 0, width, height])
    .attr("preserveAspectRatio", "xMinYMin meet")
    .style("display", "block");

  const root = d3.hierarchy(data)
    .sum(d => d.value)
    .sort((a, b) => b.value - a.value);

  d3.treemap()
    .size([width, height])
    .padding(1)(root);

  const color = d3.scaleOrdinal(d3.schemeCategory10);

  const leaf = svg.selectAll("g")
    .data(root.leaves())
    .join("g")
    .attr("transform", d => `translate(${d.x0},${d.y0})`);

  leaf.append("rect")
    .attr("id", d => (d.leafUid = (d.data && d.data.name) ? d.data.name : "unknown").replace(/\s+/g, "_"))
    .attr("fill", d => d.parent && d.parent.data && d.parent.data.name ? color(d.parent.data.name) : "#ccc")
    .attr("width", d => d.x1 - d.x0)
    .attr("height", d => d.y1 - d.y0);

  leaf.append("text")
    .attr("clip-path", d => `url(#${d.leafUid})`)
    .selectAll("tspan")
    .data(d => (d.data && d.data.name ? d.data.name.split(/\s+/) : [""]))
    .join("tspan")
    .attr("x", 4)
    .attr("y", (d, i) => 13 + i * 10)
    .text(d => d);
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
  const [email, setEmail] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);

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

  const treemapRef = useD3Chart(
  drawTreemap,
  {
    name: "root",
    children: [...new Set(data
      .filter(row =>
        (selectedProduct ? row.product_name === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      )
      .map(row => row.product_name.trim().toLowerCase()) // normalize
    )].map(name => ({
      name,
      value: data
        .filter(row =>
          (selectedProduct ? row.product_name === selectedProduct : true) &&
          (selectedStore ? row.store_name === selectedStore : true) &&
          row.product_name.trim().toLowerCase() === name
        )
        .reduce((a, b) => a + Number(b.revenue), 0)
    }))
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
    // Removed auto-refresh
  }, [token]);


  const filteredData = data.filter(row =>
    (selectedProduct ? row.product_name === selectedProduct : true) &&
    (selectedStore ? row.store_name === selectedStore : true)
  );

  const exportExcel = async () => {
    const workbook = new ExcelJS.Workbook();

    // Sheet 1: Table
    const tableSheet = workbook.addWorksheet("Dataset");
    tableSheet.addRow([`Filters: Product = ${selectedProduct || "All"}, Store = ${selectedStore || "All"}`]);
    tableSheet.addRow([]); // Empty row

    // Add table headers
    if (filteredData.length > 0) {
      tableSheet.addRow(Object.keys(filteredData[0])); // Header row
      tableSheet.addRows(filteredData.map(Object.values)); // Data rows
    }

    // Sheet 2: Charts
    const chartSheet = workbook.addWorksheet("Visuals");
    chartSheet.addRow([`Filters: Product = ${selectedProduct || "All"}, Store = ${selectedStore || "All"}`]);

    const addChartToSheet = async (chartRef, title, colOffset) => {
      if (chartRef.current) {
        const svg = chartRef.current.querySelector("svg");
        if (svg) {
          const imgData = await svgToPngDataUrl(svg);
          const imageId = workbook.addImage({
            base64: imgData,
            extension: "png",
          });

          const imageWidthInCols = 5; // Adjust based on image width and column width
          const imageStartRow = 2;
          const imageHeightInRows = 10;

          // Add image
          chartSheet.addImage(imageId, {
            tl: { col: colOffset, row: imageStartRow - 1 },
            ext: { width: 300, height: 200 },
          });

          // Merge cells below the image for the title
          const titleRowNumber = imageStartRow + imageHeightInRows;
          const startCol = colOffset + 1;
          const endCol = colOffset + imageWidthInCols;

          chartSheet.mergeCells(titleRowNumber, startCol, titleRowNumber, endCol);
          const titleCell = chartSheet.getCell(titleRowNumber, startCol);
          titleCell.value = title;
          titleCell.alignment = { horizontal: "center" };
          titleCell.font = { bold: true };
        }
      }
    };

    // Use column offsets to place charts side by side
    await addChartToSheet(lineRef, "Total Revenue Over Time", 0);
    await addChartToSheet(barRef, "Revenue by Product", 5);
    await addChartToSheet(pieRef, "Revenue by Store", 10);
    await addChartToSheet(doughnutRef, "Units Sold by Category", 15);

    // Save file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(blob, "dashboard_sales.xlsx");
  };

  const exportPDF = async () => {
    const doc = new jsPDF("p", "pt", "a4");
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();

    // Page 1: Charts
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(
      `Filters: Product = ${selectedProduct || "All"}, Store = ${selectedStore || "All"}`,
      margin,
      margin
    );

    const chartWidth = 120;
    const chartHeight = 100;
    const chartSpacing = 20;
    const startY = margin + 20;
    const chartRefs = [lineRef, barRef, pieRef, doughnutRef];
    const chartTitles = [
      "Total Revenue Over Time",
      "Revenue by Product",
      "Revenue by Store",
      "Units Sold by Category",
    ];

    // Calculate total width needed and center charts
    const totalChartWidth = chartRefs.length * chartWidth + (chartRefs.length - 1) * chartSpacing;
    let startX = (pageWidth - totalChartWidth) / 2;

    for (let i = 0; i < chartRefs.length; i++) {
      const chartRef = chartRefs[i];
      const title = chartTitles[i];

      if (chartRef.current) {
        const svg = chartRef.current.querySelector("svg");
        if (svg) {
          const chartImg = await svgToPngDataUrl(svg);
          doc.addImage(chartImg, "PNG", startX, startY, chartWidth, chartHeight);
          doc.text(title, startX + chartWidth / 2, startY + chartHeight + 15, { align: "center" });
          startX += chartWidth + chartSpacing;
        }
      }
    }
    
   // Page 2: Table
   doc.addPage();
   doc.setFont("helvetica", "normal");
   doc.setFontSize(10);
   doc.text("Sales Table", margin, margin);

   // Prepare table data
   const headers = Object.keys(filteredData[0] || {});
   const rows = filteredData.map(row => headers.map(h => row[h]));

   autoTable(doc, {
    startY: margin + 10,
    head: [headers],
    body: rows,
    styles: { font: "helvetica", fontSize: 8 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
    margin: { left: margin, right: margin },
   });

    doc.save("dashboard_sales.pdf");
  };

  const handleEmailMe = async () => {
    if (!email) {
      alert("Please enter an email address.");
      return;
    }

    try {
      const canvas = await html2canvas(document.body);
      const imageData = canvas.toDataURL("image/png");

      await axios.post(`${API_URL}/api/email_me`, {
        to: email,
        message: "Please find attached dashboard",
        image: imageData,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      alert("Dashboard emailed!");
      setShowEmailForm(false);
      setEmail("");
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
          <Form.Group>
            <Form.Label htmlFor="productDropdown"><b>Product</b></Form.Label>
            <Form.Select
              id="productDropdown"
              value={selectedProduct}
              onChange={e => setSelectedProduct(e.target.value)}
            >
              <option value="">All Products</option>
              {products.map(p => (
                <option key={p.product_id} value={p.product_name}>{p.product_name}</option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>

        <Col md={4}>
          <Form.Group>
            <Form.Label htmlFor="storeDropdown"><b>Store</b></Form.Label>
            <Form.Select
              id="storeDropdown"
              value={selectedStore}
              onChange={e => setSelectedStore(e.target.value)}
            >
              <option value="">All Stores</option>
              {stores.map(s => (
                <option key={s.store_id} value={s.store_name}>{s.store_name}</option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>

        <Col md={4} className="text-end">
          {showEmailForm ? (
            <>
              <Form.Control
                type="email"
                placeholder="Enter email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                size="sm"
                className="mb-2"
              />
              <Button onClick={handleEmailMe} className="me-2 mb-2" size="sm" variant="info">
                Submit Email
              </Button>
              <Button variant="outline-secondary" size="sm" onClick={() => setShowEmailForm(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button onClick={() => setShowEmailForm(true)} className="me-2" size="sm" variant="info">
              Send Email
            </Button>
          )}
          <div className="mt-2">
            <Button onClick={exportExcel} className="me-2" size="sm">Export Excel</Button>
            <Button onClick={exportPDF} className="me-2" size="sm">Export PDF</Button>
            <Button variant="outline-secondary" onClick={onLogout} size="sm">Logout</Button>
          </div>
        </Col>
      </Row>

      {/* All graphs in one row, 99% size within columns */}
      <Row>
        <Col md={3} className="mb-4">
          <Card>
            <Card.Body style={{ minHeight: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <div ref={lineRef} style={{ width: "99%", height: "99%" }}></div>
            </Card.Body>
            <Card.Footer className="text-center">Total Revenue Over Time</Card.Footer>
          </Card>
        </Col>
        <Col md={3} className="mb-4">
          <Card>
            <Card.Body style={{ minHeight: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <div ref={barRef} style={{ width: "99%", height: "99%" }}></div>
            </Card.Body>
            <Card.Footer className="text-center">Revenue by Product</Card.Footer>
          </Card>
        </Col>
        <Col md={3} className="mb-4">
          <Card>
            <Card.Body style={{ minHeight: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <div ref={pieRef} style={{ width: "99%", height: "99%" }}></div>
            </Card.Body>
            <Card.Footer className="text-center">Revenue by Store</Card.Footer>
          </Card>
        </Col>
        <Col md={3} className="mb-4">
          <Card>
            <Card.Body style={{ minHeight: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <div ref={doughnutRef} style={{ width: "99%", height: "99%" }}></div>
            </Card.Body>
            <Card.Footer className="text-center">Units Sold by Category</Card.Footer>
          </Card>
        </Col>
      </Row>

      <Row>
       <Col md={3} className="mb-4">
          <Card>
            <Card.Body style={{ minHeight: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <div ref={treemapRef} style={{ width: "99%", height: "99%" }}></div>
            </Card.Body>
            <Card.Footer className="text-center">Revenue Treemap</Card.Footer>
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

function PPDashboard({ token, onLogout, persona, loginName }) {
  const [data, setData] = useState([]);
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedStore, setSelectedStore] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);

  const barRef = useD3Chart(
    drawBarChart,
    {
      labels: [...new Set(data.filter(row =>
        (selectedProduct ? row.product_id === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      ).map(row => row.product_id))],
      values: [...new Set(data.filter(row =>
        (selectedProduct ? row.product_id === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      ).map(row => row.product_id))].map(
        p => data.filter(row =>
          (selectedProduct ? row.product_id === selectedProduct : true) &&
          (selectedStore ? row.store_name === selectedStore : true) &&
          row.product_id === p
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
        (selectedProduct ? row.product_id === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      ).map(row => row.store_name))],
      values: [...new Set(data.filter(row =>
        (selectedProduct ? row.product_id === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      ).map(row => row.store_name))].map(
        s => data.filter(row =>
          (selectedProduct ? row.product_id === selectedProduct : true) &&
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
        (selectedProduct ? row.product_id === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      ).map(row => row.date))].sort(),
      values: [...new Set(data.filter(row =>
        (selectedProduct ? row.product_id === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      ).map(row => row.date))].sort().map(
        d => data.filter(row =>
          (selectedProduct ? row.product_id === selectedProduct : true) &&
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
        (selectedProduct ? row.product_id === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      ).map(row => row.category))],
      values: [...new Set(data.filter(row =>
        (selectedProduct ? row.product_id === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      ).map(row => row.category))].map(
        c => data.filter(row =>
          (selectedProduct ? row.product_id === selectedProduct : true) &&
          (selectedStore ? row.store_name === selectedStore : true) &&
          row.category === c
        ).reduce((a, b) => a + Number(b.units_sold), 0)
      ),
      colors: doughnutColors
    },
    [data, selectedProduct, selectedStore]
  );

  const treemapRef = useD3Chart(
    drawTreemap,
    {
      name: "root",
      children: [...new Set(data.filter(row =>
        (selectedProduct ? row.product_id === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      ).map(row => row.product_id))].map(name => ({
        name,
        value: data.filter(row =>
          (selectedProduct ? row.product_id === selectedProduct : true) &&
          (selectedStore ? row.store_name === selectedStore : true) &&
          row.product_id === name
        ).reduce((a, b) => a + Number(b.revenue), 0)
      }))
    },
    [data, selectedProduct, selectedStore]
  );

  const tableRef = useRef();

  // Fetch products and stores
  useEffect(() => {
    axios.get(`${API_URL}/api/ppproducts`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setProducts(res.data))
      .catch(() => setProducts([]));
    axios.get(`${API_URL}/api/ppstores`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setStores(res.data))
      .catch(() => setStores([]));
  }, [token]);

  // Fetch data
  const fetchData = () => {
    setLoading(true);
    axios.get(`${API_URL}/api/ppdata`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        setData(res.data);
        setError("");
      })
      .catch(() => setError("Failed to fetch data"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    // Removed auto-refresh
  }, [token]);


  const filteredData = data.filter(row =>
    (selectedProduct ? row.product_id === selectedProduct : true) &&
    (selectedStore ? row.store_name === selectedStore : true)
  );

  const exportExcel = async () => {
    const workbook = new ExcelJS.Workbook();

    // Sheet 1: Table
    const tableSheet = workbook.addWorksheet("Dataset");
    tableSheet.addRow([`Filters: Product = ${selectedProduct || "All"}, Store = ${selectedStore || "All"}`]);
    tableSheet.addRow([]); // Empty row

    // Add table headers
    if (filteredData.length > 0) {
      tableSheet.addRow(Object.keys(filteredData[0])); // Header row
      tableSheet.addRows(filteredData.map(Object.values)); // Data rows
    }

    // Sheet 2: Charts
    const chartSheet = workbook.addWorksheet("Visuals");
    chartSheet.addRow([`Filters: Product = ${selectedProduct || "All"}, Store = ${selectedStore || "All"}`]);

    const addChartToSheet = async (chartRef, title, colOffset) => {
      if (chartRef.current) {
        const svg = chartRef.current.querySelector("svg");
        if (svg) {
          const imgData = await svgToPngDataUrl(svg);
          const imageId = workbook.addImage({
            base64: imgData,
            extension: "png",
          });

          const imageWidthInCols = 5; // Adjust based on image width and column width
          const imageStartRow = 2;
          const imageHeightInRows = 10;

          // Add image
          chartSheet.addImage(imageId, {
            tl: { col: colOffset, row: imageStartRow - 1 },
            ext: { width: 300, height: 200 },
          });

          // Merge cells below the image for the title
          const titleRowNumber = imageStartRow + imageHeightInRows;
          const startCol = colOffset + 1;
          const endCol = colOffset + imageWidthInCols;

          chartSheet.mergeCells(titleRowNumber, startCol, titleRowNumber, endCol);
          const titleCell = chartSheet.getCell(titleRowNumber, startCol);
          titleCell.value = title;
          titleCell.alignment = { horizontal: "center" };
          titleCell.font = { bold: true };
        }
      }
    };

    // Use column offsets to place charts side by side
    await addChartToSheet(lineRef, "Total Revenue Over Time", 0);
    await addChartToSheet(barRef, "Revenue by Product", 5);
    await addChartToSheet(pieRef, "Revenue by Store", 10);
    await addChartToSheet(doughnutRef, "Units Sold by Category", 15);

    // Save file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(blob, "dashboard_sales.xlsx");
  };

  const exportPDF = async () => {
    const doc = new jsPDF("p", "pt", "a4");
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();

    // Page 1: Charts
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(
      `Filters: Product = ${selectedProduct || "All"}, Store = ${selectedStore || "All"}`,
      margin,
      margin
    );

    const chartWidth = 120;
    const chartHeight = 100;
    const chartSpacing = 20;
    const startY = margin + 20;
    const chartRefs = [lineRef, barRef, pieRef, doughnutRef];
    const chartTitles = [
      "Total Revenue Over Time",
      "Revenue by Product",
      "Revenue by Store",
      "Units Sold by Category",
    ];

    // Calculate total width needed and center charts
    const totalChartWidth = chartRefs.length * chartWidth + (chartRefs.length - 1) * chartSpacing;
    let startX = (pageWidth - totalChartWidth) / 2;

    for (let i = 0; i < chartRefs.length; i++) {
      const chartRef = chartRefs[i];
      const title = chartTitles[i];

      if (chartRef.current) {
        const svg = chartRef.current.querySelector("svg");
        if (svg) {
          const chartImg = await svgToPngDataUrl(svg);
          doc.addImage(chartImg, "PNG", startX, startY, chartWidth, chartHeight);
          doc.text(title, startX + chartWidth / 2, startY + chartHeight + 15, { align: "center" });
          startX += chartWidth + chartSpacing;
        }
      }
    }
    
   // Page 2: Table
   doc.addPage();
   doc.setFont("helvetica", "normal");
   doc.setFontSize(10);
   doc.text("Sales Table", margin, margin);

   // Prepare table data
   const headers = Object.keys(filteredData[0] || {});
   const rows = filteredData.map(row => headers.map(h => row[h]));

   autoTable(doc, {
    startY: margin + 10,
    head: [headers],
    body: rows,
    styles: { font: "helvetica", fontSize: 8 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
    margin: { left: margin, right: margin },
   });

    doc.save("dashboard_sales.pdf");
  };

  const handleEmailMe = async () => {
    if (!email) {
      alert("Please enter an email address.");
      return;
    }

    try {
      const canvas = await html2canvas(document.body);
      const imageData = canvas.toDataURL("image/png");

      await axios.post(`${API_URL}/api/email_me`, {
        to: email,
        message: "Please find attached dashboard",
        image: imageData,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      alert("Dashboard emailed!");
      setShowEmailForm(false);
      setEmail("");
    } catch (e) {
      alert("Failed to send email");
    }
  };


  if (loading) return <Spinner animation="border" />;

  return (
    <Container>
      <h1 className="mt-3">Pizzeria Dashboard</h1>
      <div className="mb-3" style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#1a73e8' }}>
        Logged in as: {loginName} {persona && <>({persona})</>}
      </div>
      {error && <Alert variant="danger">{error}</Alert>}

      <Row className="my-3">
        <Col md={4}>
          <Form.Group>
            <Form.Label htmlFor="productDropdown"><b>Product</b></Form.Label>
            <Form.Select
              id="productDropdown"
              value={selectedProduct}
              onChange={e => setSelectedProduct(e.target.value)}
            >
              <option value="">All Products</option>
              {products.map(p => (
                <option key={p.product_id} value={p.product_id}>{p.product_id}</option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>

        <Col md={4}>
          <Form.Group>
            <Form.Label htmlFor="storeDropdown"><b>Store</b></Form.Label>
            <Form.Select
              id="storeDropdown"
              value={selectedStore}
              onChange={e => setSelectedStore(e.target.value)}
            >
              <option value="">All Stores</option>
              {stores.map(s => (
                <option key={s.store_id} value={s.store_name}>{s.store_name}</option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>

        <Col md={4} className="text-end">
          {showEmailForm ? (
            <>
              <Form.Control
                type="email"
                placeholder="Enter email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                size="sm"
                className="mb-2"
              />
              <Button onClick={handleEmailMe} className="me-2 mb-2" size="sm" variant="info">
                Submit Email
              </Button>
              <Button variant="outline-secondary" size="sm" onClick={() => setShowEmailForm(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button onClick={() => setShowEmailForm(true)} className="me-2" size="sm" variant="info">
              Send Email
            </Button>
          )}
          <div className="mt-2">
            <Button onClick={exportExcel} className="me-2" size="sm">Export Excel</Button>
            <Button onClick={exportPDF} className="me-2" size="sm">Export PDF</Button>
            <Button variant="outline-secondary" onClick={onLogout} size="sm">Logout</Button>
          </div>
        </Col>
      </Row>

      {/* All graphs in one row, 99% size within columns */}
      <Row>
        <Col md={3} className="mb-4">
          <Card>
            <Card.Body style={{ minHeight: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <div ref={lineRef} style={{ width: "99%", height: "99%" }}></div>
            </Card.Body>
            <Card.Footer className="text-center">Total Revenue Over Time</Card.Footer>
          </Card>
        </Col>
        <Col md={3} className="mb-4">
          <Card>
            <Card.Body style={{ minHeight: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <div ref={barRef} style={{ width: "99%", height: "99%" }}></div>
            </Card.Body>
            <Card.Footer className="text-center">Revenue by Product</Card.Footer>
          </Card>
        </Col>
        <Col md={3} className="mb-4">
          <Card>
            <Card.Body style={{ minHeight: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <div ref={pieRef} style={{ width: "99%", height: "99%" }}></div>
            </Card.Body>
            <Card.Footer className="text-center">Revenue by Store</Card.Footer>
          </Card>
        </Col>
        <Col md={3} className="mb-4">
          <Card>
            <Card.Body style={{ minHeight: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <div ref={doughnutRef} style={{ width: "99%", height: "99%" }}></div>
            </Card.Body>
            <Card.Footer className="text-center">Units Sold by Category</Card.Footer>
          </Card>
        </Col>
      </Row>

      <Row>
       <Col md={3} className="mb-4">
          <Card>
            <Card.Body style={{ minHeight: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <div ref={treemapRef} style={{ width: "99%", height: "99%" }}></div>
            </Card.Body>
            <Card.Footer className="text-center">Revenue Treemap</Card.Footer>
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
  const [selectedDashboard, setSelectedDashboard] = useState("sales");

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

  // Sidebar navigation
  const dashboards = [
    { key: "sales", label: "Sales Dashboard", component: SalesDashboard },
    { key: "pizzeria", label: "Pizzeria Dashboard", component: PizzeriaDashboard },
    { key: "customers", label: "Customers Dashboard", component: CustomersDashboard }
  ];
  const DashboardComponent = dashboards.find(d => d.key === selectedDashboard)?.component || SalesDashboard;

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
      {token ? (
        <div style={{ display: "flex", minHeight: "100vh" }}>
          <Nav
            variant="pills"
            className="flex-column p-3"
            style={{
              minWidth: 220,
              borderRight: "1px solid #eee",
              background: "#f8f9fa"
            }}
            activeKey={selectedDashboard}
            onSelect={setSelectedDashboard}
          >
            {dashboards.map(d => (
              <Nav.Link
                key={d.key}
                eventKey={d.key}
                style={{
                  marginBottom: 4,
                  fontWeight: selectedDashboard === d.key ? "bold" : "normal"
                }}
              >
                {d.label}
              </Nav.Link>
            ))}
          </Nav>
          <div style={{ flex: 1 }}>
            <DashboardComponent
              token={token}
              onLogout={() => setToken('')}
              persona={persona}
              loginName={loginName}
            />
          </div>
        </div>
      ) : (
        <Login setToken={setToken} />
      )}
    </GoogleOAuthProvider>
  );
}