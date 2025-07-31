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
  return <PPDashboard {...props} />;
}

function CustomersDashboard(props) {
  return (
    <Container fluid className="px-2 px-md-3 mt-4">
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
  const legendRows = Math.ceil(labels.length / 3);
  const legendHeight = legendRows * 20 + 10; // Dynamic height: 20px per row + padding
  const chartHeight = height - legendHeight - 30; // Reserve space for legend plus extra margin
  const radius = Math.min(width * 0.8, chartHeight * 0.8) / 2; // Constrain radius more conservatively
  d3.select(container).selectAll("*").remove();
  const svg = d3.select(container)
    .append("svg")
    .attr("width", "99%")
    .attr("height", "99%")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("display", "block");
  const g = svg.append("g")
    .attr("transform", `translate(${width / 2},${chartHeight / 2 + 15})`); // Center in available chart space

  // Calculate total for percentage calculations
  const total = values.reduce((sum, value) => sum + value, 0);
  
  const pie = d3.pie()
    .value(d => d)
    .sort(null); // Maintain original order
    
  const arc = d3.arc()
    .innerRadius(0)
    .outerRadius(radius);
    
  const outerArc = d3.arc()
    .innerRadius(radius * 1.1)
    .outerRadius(radius * 1.1);
  
  const slices = g.selectAll(".slice")
    .data(pie(values))
    .enter()
    .append("g")
    .attr("class", "slice");

  // Create pie slices
  slices.append("path")
    .attr("d", arc)
    .attr("fill", (_, i) => colors[i % colors.length])
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

  // Add percentage labels inside slices for larger slices
  slices.append("text")
    .attr("transform", d => `translate(${arc.centroid(d)})`)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .style("font-size", "12px")
    .style("font-weight", "bold")
    .style("fill", "white")
    .style("text-shadow", "1px 1px 2px rgba(0,0,0,0.8)")
    .text(d => {
      const percentage = (d.data / total * 100);
      // Only show percentage inside if slice is large enough (> 5%)
      return percentage > 5 ? `${percentage.toFixed(1)}%` : "";
    });

  // Add labels and leader lines for all slices
  const labelLines = slices.append("polyline")
    .attr("stroke", "#666")
    .attr("stroke-width", 1)
    .attr("fill", "none")
    .attr("points", d => {
      const percentage = (d.data / total * 100);
      if (percentage <= 5) { // Only show leader lines for small slices
        const pos = outerArc.centroid(d);
        const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
        pos[0] = radius * 0.95 * (midAngle < Math.PI ? 1 : -1);
        return [arc.centroid(d), outerArc.centroid(d), pos];
      }
      return null;
    });

  // Add external labels
  slices.append("text")
    .attr("transform", d => {
      const percentage = (d.data / total * 100);
      if (percentage <= 5) { // External labels for small slices
        const pos = outerArc.centroid(d);
        const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
        pos[0] = radius * 1.0 * (midAngle < Math.PI ? 1 : -1);
        return `translate(${pos})`;
      }
      return null;
    })
    .style("text-anchor", d => {
      if ((d.data / total * 100) <= 5) {
        const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
        return midAngle < Math.PI ? "start" : "end";
      }
      return "middle";
    })
    .style("font-size", "10px")
    .style("font-weight", "bold")
    .style("fill", "#333")
    .text((d, i) => {
      const percentage = (d.data / total * 100);
      if (percentage <= 5) {
        return `${labels[i]} (${percentage.toFixed(1)}%)`;
      }
      return "";
    });

  // Add legend at the bottom of the container
  const legendY = height - legendHeight;
  const legend = svg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(10, ${legendY})`);

  const legendItems = legend.selectAll(".legend-item")
    .data(labels)
    .enter()
    .append("g")
    .attr("class", "legend-item")
    .attr("transform", (d, i) => `translate(${(i % 3) * (width / 3 - 10)}, ${Math.floor(i / 3) * 20})`);

  legendItems.append("rect")
    .attr("width", 12)
    .attr("height", 12)
    .attr("fill", (d, i) => colors[i % colors.length]);

  legendItems.append("text")
    .attr("x", 16)
    .attr("y", 6)
    .attr("dy", "0.35em")
    .style("font-size", "10px")
    .style("fill", "#333")
    .text((d, i) => {
      const percentage = (values[i] / total * 100);
      const labelText = `${d} (${percentage.toFixed(1)}%)`;
      // Truncate long labels to fit in available space
      const maxLength = Math.floor((width / 3 - 30) / 6); // Approximate character width
      return labelText.length > maxLength ? labelText.substring(0, maxLength - 3) + "..." : labelText;
    });
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
  const legendRows = Math.ceil(labels.length / 3);
  const legendHeight = legendRows * 20 + 10; // Dynamic height: 20px per row + padding
  const chartHeight = height - legendHeight - 30; // Reserve space for legend plus extra margin
  const radius = Math.min(width * 0.8, chartHeight * 0.8) / 2; // Constrain radius more conservatively
  d3.select(container).selectAll("*").remove();
  const svg = d3.select(container)
    .append("svg")
    .attr("width", "99%")
    .attr("height", "99%")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("display", "block");
  const g = svg.append("g")
    .attr("transform", `translate(${width / 2},${chartHeight / 2 + 15})`); // Center in available chart space

  // Calculate total for percentage calculations
  const total = values.reduce((sum, value) => sum + value, 0);

  const pie = d3.pie()
    .value(d => d)
    .sort(null); // Maintain original order
    
  const arc = d3.arc()
    .innerRadius(radius * 0.5)
    .outerRadius(radius);
    
  const outerArc = d3.arc()
    .innerRadius(radius * 1.1)
    .outerRadius(radius * 1.1);
  
  const slices = g.selectAll(".slice")
    .data(pie(values))
    .enter()
    .append("g")
    .attr("class", "slice");

  // Create doughnut slices
  slices.append("path")
    .attr("d", arc)
    .attr("fill", (_, i) => colors[i % colors.length])
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

  // Add percentage labels inside slices for larger slices
  slices.append("text")
    .attr("transform", d => `translate(${arc.centroid(d)})`)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .style("font-size", "11px")
    .style("font-weight", "bold")
    .style("fill", "white")
    .style("text-shadow", "1px 1px 2px rgba(0,0,0,0.8)")
    .text(d => {
      const percentage = (d.data / total * 100);
      // Only show percentage inside if slice is large enough (> 8% for doughnut)
      return percentage > 8 ? `${percentage.toFixed(1)}%` : "";
    });

  // Add total value in center of doughnut
  g.append("text")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("fill", "#333")
    .text("Total")
    .attr("y", -8);

  g.append("text")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .style("font-size", "12px")
    .style("fill", "#666")
    .text(total.toLocaleString())
    .attr("y", 8);

  // Add labels and leader lines for small slices
  const labelLines = slices.append("polyline")
    .attr("stroke", "#666")
    .attr("stroke-width", 1)
    .attr("fill", "none")
    .attr("points", d => {
      const percentage = (d.data / total * 100);
      if (percentage <= 8) { // Only show leader lines for small slices
        const pos = outerArc.centroid(d);
        const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
        pos[0] = radius * 0.95 * (midAngle < Math.PI ? 1 : -1);
        return [arc.centroid(d), outerArc.centroid(d), pos];
      }
      return null;
    });

  // Add external labels for small slices
  slices.append("text")
    .attr("transform", d => {
      const percentage = (d.data / total * 100);
      if (percentage <= 8) { // External labels for small slices
        const pos = outerArc.centroid(d);
        const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
        pos[0] = radius * 1.0 * (midAngle < Math.PI ? 1 : -1);
        return `translate(${pos})`;
      }
      return null;
    })
    .style("text-anchor", d => {
      if ((d.data / total * 100) <= 8) {
        const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
        return midAngle < Math.PI ? "start" : "end";
      }
      return "middle";
    })
    .style("font-size", "10px")
    .style("font-weight", "bold")
    .style("fill", "#333")
    .text((d, i) => {
      const percentage = (d.data / total * 100);
      if (percentage <= 8) {
        return `${labels[i]} (${percentage.toFixed(1)}%)`;
      }
      return "";
    });

  // Add legend at the bottom of the container
  const legendY = height - legendHeight;
  const legend = svg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(10, ${legendY})`);

  const legendItems = legend.selectAll(".legend-item")
    .data(labels)
    .enter()
    .append("g")
    .attr("class", "legend-item")
    .attr("transform", (d, i) => `translate(${(i % 3) * (width / 3 - 10)}, ${Math.floor(i / 3) * 20})`);

  legendItems.append("rect")
    .attr("width", 12)
    .attr("height", 12)
    .attr("fill", (d, i) => colors[i % colors.length]);

  legendItems.append("text")
    .attr("x", 16)
    .attr("y", 6)
    .attr("dy", "0.35em")
    .style("font-size", "10px")
    .style("fill", "#333")
    .text((d, i) => {
      const percentage = (values[i] / total * 100);
      const labelText = `${d} (${percentage.toFixed(1)}%)`;
      // Truncate long labels to fit in available space
      const maxLength = Math.floor((width / 3 - 30) / 6); // Approximate character width
      return labelText.length > maxLength ? labelText.substring(0, maxLength - 3) + "..." : labelText;
    });
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

  const format = d3.format(",d");
  const color = d3.scaleOrdinal(d3.schemeCategory10);

  let root = d3.hierarchy(data)
    .sum(d => d.value)
    .sort((a, b) => b.value - a.value);

  d3.treemap()
    .size([width, height])
    .padding(1)(root);

  let currentRoot = root;
  let group = svg.append("g").call(render, root);

  function render(group, root) {
    const node = group
      .selectAll("g")
      .data(root.children || [])
      .join("g")
      .attr("transform", d => `translate(${d.x0},${d.y0})`);

    node.append("rect")
      .attr("id", d => (d.leafUid = (d.data && d.data.name) ? d.data.name : "unknown").replace(/\s+/g, "_"))
      .attr("fill", d => color(d.data.name))
      .attr("width", d => d.x1 - d.x0)
      .attr("height", d => d.y1 - d.y0)
      .on("click", (event, d) => {
        event.stopPropagation();
        if (!d.children) return;
        zoomIn(d);
      });

    // Add name text
    node.append("text")
      .attr("x", 4)
      .attr("y", 13)
      .attr("font-weight", "bold")
      .attr("fill", "white")
      .style("text-shadow", "1px 1px 2px rgba(0,0,0,0.8)")
      .text(d => {
        // Truncate text based on rectangle width
        const rectWidth = d.x1 - d.x0;
        let name = d.data.name || "";
        if (rectWidth < 40 && name.length > 6) {
          return name.substring(0, 4) + "...";
        } else if (rectWidth < 60 && name.length > 10) {
          return name.substring(0, 8) + "...";
        } else if (rectWidth < 100 && name.length > 15) {
          return name.substring(0, 12) + "...";
        }
        return name;
      })
      .attr("font-size", d => {
        // Dynamic font size based on rectangle size
        const rectWidth = d.x1 - d.x0;
        const rectHeight = d.y1 - d.y0;
        const minDimension = Math.min(rectWidth, rectHeight);
        return Math.max(9, Math.min(14, minDimension / 5)) + "px";
      })
      .style("opacity", d => {
        // Show name if rectangle is at least 20px wide and 12px tall
        const rectWidth = d.x1 - d.x0;
        const rectHeight = d.y1 - d.y0;
        return (rectWidth > 20 && rectHeight > 12) ? 1 : 0;
      });

    // Add value text
    node.append("text")
      .attr("x", 4)
      .attr("y", d => {
        // Position value text based on rectangle height
        const rectHeight = d.y1 - d.y0;
        return rectHeight > 25 ? 28 : 23;
      })
      .attr("fill", "white")
      .style("text-shadow", "1px 1px 2px rgba(0,0,0,0.8)")
      .text(d => {
        if (d.value) {
          const rectWidth = d.x1 - d.x0;
          if (rectWidth < 40) {
            // Show abbreviated format for very small rectangles
            return `$${(d.value / 1000).toFixed(0)}k`;
          } else {
            return `$${format(d.value)}`;
          }
        }
        return "";
      })
      .attr("font-size", d => {
        // Dynamic font size for values, slightly smaller than names
        const rectWidth = d.x1 - d.x0;
        const rectHeight = d.y1 - d.y0;
        const minDimension = Math.min(rectWidth, rectHeight);
        return Math.max(8, Math.min(12, minDimension / 6)) + "px";
      })
      .style("opacity", d => {
        // Show value if rectangle is at least 25px wide and 18px tall
        const rectWidth = d.x1 - d.x0;
        const rectHeight = d.y1 - d.y0;
        return (rectWidth > 25 && rectHeight > 18) ? 1 : 0;
      });
  }

  function zoomIn(d) {
    currentRoot = d;
    const t = svg.transition().duration(750);
    group.remove();
    group = svg.append("g").call(render, currentRoot);
  }

  function zoomOut() {
    if (!currentRoot.parent) return;
    currentRoot = currentRoot.parent;
    const t = svg.transition().duration(750);
    group.remove();
    group = svg.append("g").call(render, currentRoot);
  }

  svg.on("click", () => {
    zoomOut();
  });
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

function Dashboard({ token, persona, loginName }) {
  const [bookmarkName, setBookmarkName] = useState("");
  const [selectedBookmark, setSelectedBookmark] = useState("");
  // Load bookmarks from localStorage or use empty object
  const [bookmarks, setBookmarks] = useState(() => {
    try {
      const savedBookmarks = localStorage.getItem('dashboard-bookmarks');
      return savedBookmarks ? JSON.parse(savedBookmarks) : {};
    } catch (error) {
      console.error('Error loading bookmarks:', error);
      return {};
    }
  });

  const [editBookmark, setEditBookmark] = useState("");
  const [renameBookmark, setRenameBookmark] = useState("");
  
  // Chart selection state
  const [selectedCharts, setSelectedCharts] = useState({
    lineChart: true,
    barChart: true,
    pieChart: true,
    doughnutChart: true,
    treemapChart: true,
    histogramChart: true,
    dataTable: true
  });

  // Force chart re-render when charts are toggled
  const [chartRenderKey, setChartRenderKey] = useState(0);

  // Force chart re-render when selectedCharts changes
  useEffect(() => {
    // Small delay to ensure DOM updates before re-rendering charts
    const timer = setTimeout(() => {
      // Clear all chart containers and trigger re-render
      const chartContainers = document.querySelectorAll('.chart-container > div');
      chartContainers.forEach(container => {
        if (container) {
          container.innerHTML = '';
        }
      });
      // Force a state update to trigger re-rendering
      setChartRenderKey(prev => prev + 1);
    }, 50);
    return () => clearTimeout(timer);
  }, [selectedCharts]);
  const handleSaveBookmark = () => {
    if (!bookmarkName) {
      alert("Please enter a bookmark name.");
      return;
    }
    const newBookmarks = { ...bookmarks };
    newBookmarks[bookmarkName] = {
      product: selectedProduct,
      store: selectedStore,
      charts: selectedCharts
    };
    setBookmarks(newBookmarks);
    // Persist to localStorage
    localStorage.setItem('dashboard-bookmarks', JSON.stringify(newBookmarks));
    setBookmarkName(""); // Clear the input
    alert(`Bookmark '${bookmarkName}' saved with selected charts!`);
  };

  const handleRenameBookmark = () => {
    if (!editBookmark || !renameBookmark) {
      alert("Please select a bookmark and enter a new name.");
      return;
    }
    if (bookmarks[renameBookmark]) {
      alert("A bookmark with the new name already exists.");
      return;
    }
    const newBookmarks = { ...bookmarks };
    newBookmarks[renameBookmark] = newBookmarks[editBookmark];
    delete newBookmarks[editBookmark];
    setBookmarks(newBookmarks);
    // Persist to localStorage
    localStorage.setItem('dashboard-bookmarks', JSON.stringify(newBookmarks));
    setEditBookmark("");
    setRenameBookmark("");
    alert(`Bookmark renamed to '${renameBookmark}'`);
  };

  // Handle chart selection toggle
  const handleChartSelection = (chartName) => {
    setSelectedCharts(prev => ({
      ...prev,
      [chartName]: !prev[chartName]
    }));
    // Re-rendering is handled by useEffect when selectedCharts changes
  };

  // Function to select/deselect all charts
  const handleSelectAllCharts = (selectAll) => {
    setSelectedCharts({
      lineChart: selectAll,
      barChart: selectAll,
      pieChart: selectAll,
      doughnutChart: selectAll,
      treemapChart: selectAll,
      histogramChart: selectAll,
      dataTable: selectAll
    });
    // Re-rendering is handled by useEffect when selectedCharts changes
  };

  
  
const handleApplyBookmark = (name) => {
  if (!name || !bookmarks[name]) return;
  const bookmark = bookmarks[name];
  setSelectedProduct(bookmark.product || "");
  setSelectedStore(bookmark.store || "");
  setSelectedBookmark(name);
  
  // Apply chart selections if available, otherwise show all charts
  if (bookmark.charts) {
    setSelectedCharts(bookmark.charts);
  } else {
    // For backward compatibility with old bookmarks
    setSelectedCharts({
      lineChart: true,
      barChart: true,
      pieChart: true,
      doughnutChart: true,
      treemapChart: true,
      histogramChart: true,
      dataTable: true
    });
  }
  // Re-rendering is handled by useEffect when selectedCharts changes
};


const handleDeleteBookmark = () => {
    if (!editBookmark) {
      alert("Please select a bookmark to delete.");
      return;
    }
    const newBookmarks = { ...bookmarks };
    delete newBookmarks[editBookmark];
    setBookmarks(newBookmarks);
    // Persist to localStorage
    localStorage.setItem('dashboard-bookmarks', JSON.stringify(newBookmarks));
    setEditBookmark("");
    setRenameBookmark("");
    alert("Bookmark deleted.");
  };

  const [data, setData] = useState([]);
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedStore, setSelectedStore] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [showSubscribeForm, setShowSubscribeForm] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [reportFormat, setReportFormat] = useState("");
  
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
    [data, selectedProduct, selectedStore, chartRenderKey]
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
    [data, selectedProduct, selectedStore, chartRenderKey]
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
    [data, selectedProduct, selectedStore, chartRenderKey]
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
    [data, selectedProduct, selectedStore, chartRenderKey]
  );
  
  const tableRef = useRef();

const treemapRef = useD3Chart(
  drawTreemap,
  {
    name: "root",
    children: [...new Set(data
      .filter(row =>
        (selectedProduct ? row.product_name === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      )
      .map(row => row.category)
    )].map(category => ({
      name: category,
      children: [...new Set(data
        .filter(row =>
          (selectedProduct ? row.product_name === selectedProduct : true) &&
          (selectedStore ? row.store_name === selectedStore : true) &&
          row.category === category
        )
        .map(row => row.product_name)
      )].map(product => ({
        name: product,
        value: data
          .filter(row =>
            (selectedProduct ? row.product_name === selectedProduct : true) &&
            (selectedStore ? row.store_name === selectedStore : true) &&
            row.category === category &&
            row.product_name === product
          )
          .reduce((a, b) => a + Number(b.revenue), 0)
      }))
    }))
  },
  [data, selectedProduct, selectedStore, chartRenderKey]
);

const histogramRef = useD3Chart(
  drawHistogram,
  {
    data: data
      .filter(row =>
        (selectedProduct ? row.product_name === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      )
      .map(row => Number(row.revenue)),
    bins: 15,
    xLabel: "Revenue",
    yLabel: "Frequency"
  },
  [data, selectedProduct, selectedStore, chartRenderKey]
);

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


  
const handleSubscribeSubmit = async () => {
  try {
    const payload = {
      repeatFrequency,
      scheduledTime,
      reportFormat,
      email: loginName || "",  // use logged-in user email if available
    };
    await axios.post(`${API_URL}/api/schedule_report`, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });
    alert("Subscription scheduled successfully!");
    setShowSubscribeForm(false);
  } catch (error) {
    alert("Failed to schedule subscription.");
  }
};


if (loading) return <Spinner animation="border" />;

  return (
    <Container fluid className="px-2 px-md-3">
      <h1 className="mt-3">Sales Dashboard</h1>
      <div className="mb-3" style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#1a73e8' }}>
        Logged in as: {loginName} {persona && <>({persona})</>}
      </div>
      {error && <Alert variant="danger">{error}</Alert>}

      <Row className="my-3">
        <Col lg={4} md={6} className="mb-2">
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

        <Col lg={4} md={6} className="mb-2">
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

        <Col lg={4} md={12} className="d-flex flex-column">
            {showSubscribeForm ? (
            <div className="mb-2">
              <Form.Control
                type="text"
                placeholder="Repeat Frequency (e.g., daily, weekly)"
                onChange={(e) => setRepeatFrequency(e.target.value)}
                className="mb-2"
                size="sm"
              />
              <Form.Control
                type="time"
                placeholder="Scheduled Time"
                onChange={(e) => setScheduledTime(e.target.value)}
                className="mb-2"
                size="sm"
              />
              <Form.Select
                onChange={(e) => setReportFormat(e.target.value)}
                className="mb-2"
                size="sm"
              >
                <option value="">Select Format</option>
                <option value="pdf">PDF</option>
                <option value="excel">Excel</option>
              </Form.Select>
              <div className="d-flex gap-1">
                <Button onClick={handleSubscribeSubmit} size="sm" variant="success" className="flex-fill">
                  Submit
                </Button>
                <Button onClick={() => setShowSubscribeForm(false)} size="sm" variant="secondary" className="flex-fill">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setShowSubscribeForm(true)} size="sm" variant="warning" className="mb-2">
              Subscribe
            </Button>
          )}
            {showEmailForm ? (
            <div className="mb-2">
              <Form.Control
                type="email"
                placeholder="Enter email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                size="sm"
                className="mb-2"
              />
              <div className="d-flex gap-1">
                <Button onClick={handleEmailMe} className="flex-fill" size="sm" variant="info">
                  Submit Email
                </Button>
                <Button variant="outline-secondary" size="sm" onClick={() => setShowEmailForm(false)} className="flex-fill">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setShowEmailForm(true)} className="mb-2" size="sm" variant="info">
              Send Email
            </Button>
          )}
          <div className="d-flex gap-1 mb-2">
            <Button onClick={exportExcel} size="sm" variant="success" className="flex-fill">Export Excel</Button>
            <Button onClick={exportPDF} size="sm" variant="primary" className="flex-fill">Export PDF</Button>
          </div>
        </Col>
      </Row>

<Row className="mb-3">
  <Col lg={4} md={6} className="mb-3">
    <Form.Group>
      <Form.Label><b>Save Current Bookmark</b></Form.Label>
      <Form.Control
        type="text"
        placeholder="Enter bookmark name"
        value={bookmarkName}
        onChange={e => setBookmarkName(e.target.value)}
        className="mb-2"
        size="sm"
      />
      <Button onClick={handleSaveBookmark} size="sm" variant="primary" className="w-100">Save Bookmark</Button>
    </Form.Group>
  </Col>
  <Col lg={4} md={6} className="mb-3">
    <Form.Group>
      <Form.Label><b>Apply Bookmark</b></Form.Label>
      <Form.Select
        value={selectedBookmark}
        onChange={e => handleApplyBookmark(e.target.value)}
        className="mb-2"
        size="sm"
      >
        <option value="">Select Bookmark</option>
        {Object.keys(bookmarks).map(name => (
          <option key={name} value={name}>{name}</option>
        ))}
      </Form.Select>
    </Form.Group>
  </Col>
  <Col lg={4} md={12} className="mb-3">
    <Form.Group>
      <Form.Label><b>Edit/Delete Bookmark</b></Form.Label>
      <Form.Select
        value={editBookmark}
        onChange={e => setEditBookmark(e.target.value)}
        className="mb-2"
        size="sm"
      >
        <option value="">Select Bookmark</option>
        {Object.keys(bookmarks).map(name => (
          <option key={name} value={name}>{name}</option>
        ))}
      </Form.Select>
      <Form.Control
        type="text"
        placeholder="Rename selected bookmark"
        value={renameBookmark}
        onChange={e => setRenameBookmark(e.target.value)}
        className="mb-2"
        size="sm"
      />
      <div className="d-flex gap-1">
        <Button onClick={handleRenameBookmark} size="sm" variant="warning" className="flex-fill">Rename</Button>
        <Button onClick={handleDeleteBookmark} size="sm" variant="danger" className="flex-fill">Delete</Button>
      </div>
    </Form.Group>
  </Col>
</Row>

{/* Chart Selection Interface */}
<Row className="mb-3">
  <Col>
    <Card className="mb-3">
      <Card.Header className="d-flex justify-content-between align-items-center">
        <h6 className="mb-0">Select Charts for Bookmark</h6>
        <div>
          <Button 
            size="sm" 
            variant="outline-primary" 
            className="me-2"
            onClick={() => handleSelectAllCharts(true)}
          >
            Select All
          </Button>
          <Button 
            size="sm" 
            variant="outline-secondary"
            onClick={() => handleSelectAllCharts(false)}
          >
            Deselect All
          </Button>
        </div>
      </Card.Header>
      <Card.Body className="py-2">
        <Row>
          <Col md={2} sm={4} xs={6} className="mb-2">
            <Form.Check
              type="checkbox"
              id="lineChart"
              label="Revenue Over Time"
              checked={selectedCharts.lineChart}
              onChange={() => handleChartSelection('lineChart')}
            />
          </Col>
          <Col md={2} sm={4} xs={6} className="mb-2">
            <Form.Check
              type="checkbox"
              id="barChart"
              label="Revenue by Product"
              checked={selectedCharts.barChart}
              onChange={() => handleChartSelection('barChart')}
            />
          </Col>
          <Col md={2} sm={4} xs={6} className="mb-2">
            <Form.Check
              type="checkbox"
              id="pieChart"
              label="Revenue by Store"
              checked={selectedCharts.pieChart}
              onChange={() => handleChartSelection('pieChart')}
            />
          </Col>
          <Col md={2} sm={4} xs={6} className="mb-2">
            <Form.Check
              type="checkbox"
              id="doughnutChart"
              label="Units by Category"
              checked={selectedCharts.doughnutChart}
              onChange={() => handleChartSelection('doughnutChart')}
            />
          </Col>
          <Col md={2} sm={4} xs={6} className="mb-2">
            <Form.Check
              type="checkbox"
              id="treemapChart"
              label="Revenue Treemap"
              checked={selectedCharts.treemapChart}
              onChange={() => handleChartSelection('treemapChart')}
            />
          </Col>
          <Col md={2} sm={4} xs={6} className="mb-2">
            <Form.Check
              type="checkbox"
              id="histogramChart"
              label="Revenue Histogram"
              checked={selectedCharts.histogramChart}
              onChange={() => handleChartSelection('histogramChart')}
            />
          </Col>
          <Col md={2} sm={4} xs={6} className="mb-2">
            <Form.Check
              type="checkbox"
              id="dataTable"
              label="Data Table"
              checked={selectedCharts.dataTable}
              onChange={() => handleChartSelection('dataTable')}
            />
          </Col>
        </Row>
      </Card.Body>
    </Card>
  </Col>
</Row>

{/* All graphs in individual rows for better visibility */}
{selectedCharts.lineChart && (
  <Row>
    <Col lg={8} md={10} sm={12} className="mb-4">
      <Card>
        <Card.Body className="chart-container p-0" style={{ height: "350px" }}>
          <div ref={lineRef} style={{ width: "99%", height: "99%" }}></div>
        </Card.Body>
        <Card.Footer className="text-center small">Total Revenue Over Time</Card.Footer>
      </Card>
    </Col>
  </Row>
)}

{selectedCharts.barChart && (
  <Row>
    <Col lg={8} md={10} sm={12} className="mb-4">
      <Card>
        <Card.Body className="chart-container p-0" style={{ height: "350px" }}>
          <div ref={barRef} style={{ width: "99%", height: "99%" }}></div>
        </Card.Body>
        <Card.Footer className="text-center small">Revenue by Product</Card.Footer>
      </Card>
    </Col>
  </Row>
)}

{selectedCharts.pieChart && (
  <Row>
    <Col lg={6} md={8} sm={12} className="mb-4">
      <Card>
        <Card.Body className="chart-container p-0" style={{ height: "400px" }}>
          <div ref={pieRef} style={{ width: "99%", height: "99%" }}></div>
        </Card.Body>
        <Card.Footer className="text-center small">Revenue by Store</Card.Footer>
      </Card>
    </Col>
  </Row>
)}

{selectedCharts.doughnutChart && (
  <Row>
    <Col lg={6} md={8} sm={12} className="mb-4">
      <Card>
        <Card.Body className="chart-container p-0" style={{ height: "400px" }}>
          <div ref={doughnutRef} style={{ width: "99%", height: "99%" }}></div>
        </Card.Body>
        <Card.Footer className="text-center small">Units Sold by Category</Card.Footer>
      </Card>
    </Col>
  </Row>
)}

{selectedCharts.treemapChart && (
  <Row>
    <Col lg={10} md={12} className="mb-4">
      <Card>
        <Card.Body className="chart-container p-0" style={{ height: "450px" }}>
          <div ref={treemapRef} style={{ width: "99%", height: "99%" }}></div>
        </Card.Body>
        <Card.Footer className="text-center small">Revenue Treemap</Card.Footer>
      </Card>
    </Col>
  </Row>
)}

{selectedCharts.histogramChart && (
  <Row>
    <Col lg={8} md={10} sm={12} className="mb-4">
      <Card>
        <Card.Body className="chart-container p-0" style={{ height: "350px" }}>
          <div ref={histogramRef} style={{ width: "99%", height: "99%" }}></div>
        </Card.Body>
        <Card.Footer className="text-center small">Revenue Distribution</Card.Footer>
      </Card>
    </Col>
  </Row>
)}

{selectedCharts.dataTable && (
  <div ref={tableRef} className="mt-4">
    <div className="table-responsive">
      <Table striped bordered hover size="sm">
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
        </div>
)}
    </Container>
  );
}

function PPDashboard({ token, persona, loginName }) {
  const [data, setData] = useState([]);
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedStore, setSelectedStore] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);

  // Bookmark states for PPDashboard
  const [bookmarkName, setBookmarkName] = useState("");
  const [selectedBookmark, setSelectedBookmark] = useState("");
  // Load bookmarks from localStorage or use empty object
  const [bookmarks, setBookmarks] = useState(() => {
    try {
      const savedBookmarks = localStorage.getItem('pp-dashboard-bookmarks');
      return savedBookmarks ? JSON.parse(savedBookmarks) : {};
    } catch (error) {
      console.error('Error loading PP bookmarks:', error);
      return {};
    }
  });
  const [editBookmark, setEditBookmark] = useState("");
  const [renameBookmark, setRenameBookmark] = useState("");

  // Chart selection state for PPDashboard
  const [selectedCharts, setSelectedCharts] = useState({
    lineChart: true,
    barChart: true,
    pieChart: true,
    doughnutChart: true,
    treemapChart: true,
    histogramChart: true,
    dataTable: true
  });

  // Handle chart selection toggle
  const handleChartSelection = (chartName) => {
    setSelectedCharts(prev => ({
      ...prev,
      [chartName]: !prev[chartName]
    }));
  };

  // Function to select/deselect all charts
  const handleSelectAllCharts = (selectAll) => {
    setSelectedCharts({
      lineChart: selectAll,
      barChart: selectAll,
      pieChart: selectAll,
      doughnutChart: selectAll,
      treemapChart: selectAll,
      histogramChart: selectAll,
      dataTable: selectAll
    });
  };

  // Bookmark handler functions for PPDashboard
  const handleSaveBookmark = () => {
    if (!bookmarkName) {
      alert("Please enter a bookmark name.");
      return;
    }
    const newBookmarks = { ...bookmarks };
    newBookmarks[bookmarkName] = {
      product: selectedProduct,
      store: selectedStore,
      charts: selectedCharts
    };
    setBookmarks(newBookmarks);
    // Persist to localStorage
    localStorage.setItem('pp-dashboard-bookmarks', JSON.stringify(newBookmarks));
    setBookmarkName(""); // Clear the input
    alert(`Bookmark '${bookmarkName}' saved with selected charts!`);
  };

  const handleApplyBookmark = (name) => {
    if (!name || !bookmarks[name]) return;
    const bookmark = bookmarks[name];
    setSelectedProduct(bookmark.product || "");
    setSelectedStore(bookmark.store || "");
    setSelectedBookmark(name);
    
    // Apply chart selections if available, otherwise show all charts
    if (bookmark.charts) {
      setSelectedCharts(bookmark.charts);
    } else {
      // For backward compatibility with old bookmarks
      setSelectedCharts({
        lineChart: true,
        barChart: true,
        pieChart: true,
        doughnutChart: true,
        treemapChart: true,
        histogramChart: true,
        dataTable: true
      });
    }
    // Re-rendering is handled by useEffect when selectedCharts changes
  };

  const handleRenameBookmark = () => {
    if (!editBookmark || !renameBookmark) {
      alert("Please select a bookmark and enter a new name.");
      return;
    }
    if (bookmarks[renameBookmark]) {
      alert("A bookmark with the new name already exists.");
      return;
    }
    const newBookmarks = { ...bookmarks };
    newBookmarks[renameBookmark] = newBookmarks[editBookmark];
    delete newBookmarks[editBookmark];
    setBookmarks(newBookmarks);
    // Persist to localStorage
    localStorage.setItem('pp-dashboard-bookmarks', JSON.stringify(newBookmarks));
    setEditBookmark("");
    setRenameBookmark("");
    alert(`Bookmark renamed to '${renameBookmark}'`);
  };

  const handleDeleteBookmark = () => {
    if (!editBookmark) {
      alert("Please select a bookmark to delete.");
      return;
    }
    const newBookmarks = { ...bookmarks };
    delete newBookmarks[editBookmark];
    setBookmarks(newBookmarks);
    // Persist to localStorage
    localStorage.setItem('pp-dashboard-bookmarks', JSON.stringify(newBookmarks));
    setEditBookmark("");
    setRenameBookmark("");
    alert("Bookmark deleted.");
  };

  // Force chart re-render when charts are toggled
  const [chartRenderKey, setChartRenderKey] = useState(0);

  // Force chart re-render when selectedCharts changes
  useEffect(() => {
    // Small delay to ensure DOM updates before re-rendering charts
    const timer = setTimeout(() => {
      // Clear all chart containers and trigger re-render
      const chartContainers = document.querySelectorAll('.chart-container > div');
      chartContainers.forEach(container => {
        if (container) {
          container.innerHTML = '';
        }
      });
      // Force a state update to trigger re-rendering
      setChartRenderKey(prev => prev + 1);
    }, 50);
    return () => clearTimeout(timer);
  }, [selectedCharts]);

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
    [data, selectedProduct, selectedStore, chartRenderKey]
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
    [data, selectedProduct, selectedStore, chartRenderKey]
  );

  const treemapRef = useD3Chart(
  drawTreemap,
  {
    name: "root",
    children: [...new Set(data
      .filter(row =>
        (selectedProduct ? row.product_id === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      )
      .map(row => row.category)
    )].map(category => ({
      name: category,
      children: [...new Set(data
        .filter(row =>
          (selectedProduct ? row.product_id === selectedProduct : true) &&
          (selectedStore ? row.store_name === selectedStore : true) &&
          row.category === category
        )
        .map(row => row.product_id)
      )].map(product => ({
        name: product,
        value: data
          .filter(row =>
            (selectedProduct ? row.product_id === selectedProduct : true) &&
            (selectedStore ? row.store_name === selectedStore : true) &&
            row.category === category &&
            row.product_id === product
          )
          .reduce((a, b) => a + Number(b.revenue), 0)
      }))
    }))
  },
  [data, selectedProduct, selectedStore, chartRenderKey]
);

  const histogramRef = useD3Chart(
    drawHistogram,
    {
      data: data
        .filter(row =>
          (selectedProduct ? row.product_id === selectedProduct : true) &&
          (selectedStore ? row.store_name === selectedStore : true)
        )
        .map(row => Number(row.revenue)),
      bins: 15,
      xLabel: "Revenue",
      yLabel: "Frequency"
    },
    [data, selectedProduct, selectedStore, chartRenderKey]
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
    <Container fluid className="px-2 px-md-3">
      <h1 className="mt-3">Pizzeria Dashboard</h1>
      <div className="mb-3" style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#1a73e8' }}>
        Logged in as: {loginName} {persona && <>({persona})</>}
      </div>
      {error && <Alert variant="danger">{error}</Alert>}

      <Row className="my-3">
        <Col lg={4} md={6} className="mb-2">
          <Form.Group>
            <Form.Label htmlFor="productDropdown"><b>Product</b></Form.Label>
            <Form.Select
              id="productDropdown"
              value={selectedProduct}
              onChange={e => setSelectedProduct(e.target.value)}
              size="sm"
            >
              <option value="">All Products</option>
              {products.map(p => (
                <option key={p.product_id} value={p.product_id}>{p.product_id}</option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>

        <Col lg={4} md={6} className="mb-2">
          <Form.Group>
            <Form.Label htmlFor="storeDropdown"><b>Store</b></Form.Label>
            <Form.Select
              id="storeDropdown"
              value={selectedStore}
              onChange={e => setSelectedStore(e.target.value)}
              size="sm"
            >
              <option value="">All Stores</option>
              {stores.map(s => (
                <option key={s.store_id} value={s.store_name}>{s.store_name}</option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>

        <Col lg={4} md={12} className="d-flex flex-column">
          {showEmailForm ? (
            <div className="mb-2">
              <Form.Control
                type="email"
                placeholder="Enter email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                size="sm"
                className="mb-2"
              />
              <div className="d-flex gap-1">
                <Button onClick={handleEmailMe} className="flex-fill" size="sm" variant="info">
                  Submit Email
                </Button>
                <Button variant="outline-secondary" size="sm" onClick={() => setShowEmailForm(false)} className="flex-fill">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setShowEmailForm(true)} className="mb-2" size="sm" variant="info">
              Send Email
            </Button>
          )}
          <div className="d-flex gap-1 mb-2">
            <Button onClick={exportExcel} size="sm" variant="success" className="flex-fill">Export Excel</Button>
            <Button onClick={exportPDF} size="sm" variant="primary" className="flex-fill">Export PDF</Button>
          </div>
        </Col>
      </Row>

      {/* Bookmark Controls */}
      <Row className="my-3">
        <Col lg={6} md={12} className="mb-3">
          <Card>
            <Card.Header><h6 className="mb-0">Save/Apply Bookmarks</h6></Card.Header>
            <Card.Body>
              <Row>
                <Col md={6} className="mb-2">
                  <Form.Group>
                    <Form.Label><small>Save New Bookmark:</small></Form.Label>
                    <div className="d-flex gap-1">
                      <Form.Control
                        size="sm"
                        placeholder="Bookmark name"
                        value={bookmarkName}
                        onChange={e => setBookmarkName(e.target.value)}
                      />
                      <Button onClick={handleSaveBookmark} size="sm" variant="primary">Save</Button>
                    </div>
                  </Form.Group>
                </Col>
                <Col md={6} className="mb-2">
                  <Form.Group>
                    <Form.Label><small>Apply Bookmark:</small></Form.Label>
                    <div className="d-flex gap-1">
                      <Form.Select
                        size="sm"
                        value={selectedBookmark}
                        onChange={e => {
                          setSelectedBookmark(e.target.value);
                          handleApplyBookmark(e.target.value);
                        }}
                      >
                        <option value="">Select bookmark...</option>
                        {Object.keys(bookmarks).map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </Form.Select>
                    </div>
                  </Form.Group>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={6} md={12} className="mb-3">
          <Card>
            <Card.Header><h6 className="mb-0">Manage Bookmarks</h6></Card.Header>
            <Card.Body>
              <Row>
                <Col md={4} className="mb-2">
                  <Form.Group>
                    <Form.Label><small>Select:</small></Form.Label>
                    <Form.Select
                      size="sm"
                      value={editBookmark}
                      onChange={e => setEditBookmark(e.target.value)}
                    >
                      <option value="">Choose...</option>
                      {Object.keys(bookmarks).map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={4} className="mb-2">
                  <Form.Group>
                    <Form.Label><small>Rename to:</small></Form.Label>
                    <Form.Control
                      size="sm"
                      placeholder="New name"
                      value={renameBookmark}
                      onChange={e => setRenameBookmark(e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={4} className="mb-2">
                  <Form.Group>
                    <Form.Label><small>Actions:</small></Form.Label>
                    <div className="d-flex gap-1">
                      <Button onClick={handleRenameBookmark} size="sm" variant="warning" className="flex-fill">Rename</Button>
                      <Button onClick={handleDeleteBookmark} size="sm" variant="danger" className="flex-fill">Delete</Button>
                    </div>
                  </Form.Group>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Chart Selection Interface */}
      <Row className="mb-3">
        <Col>
          <Card className="mb-3">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h6 className="mb-0">Select Charts for Bookmark</h6>
              <div>
                <Button 
                  size="sm" 
                  variant="outline-primary" 
                  className="me-2"
                  onClick={() => handleSelectAllCharts(true)}
                >
                  Select All
                </Button>
                <Button 
                  size="sm" 
                  variant="outline-secondary"
                  onClick={() => handleSelectAllCharts(false)}
                >
                  Deselect All
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="py-2">
              <Row>
                <Col md={2} sm={4} xs={6} className="mb-2">
                  <Form.Check
                    type="checkbox"
                    id="lineChart-pp"
                    label="Revenue Over Time"
                    checked={selectedCharts.lineChart}
                    onChange={() => handleChartSelection('lineChart')}
                  />
                </Col>
                <Col md={2} sm={4} xs={6} className="mb-2">
                  <Form.Check
                    type="checkbox"
                    id="barChart-pp"
                    label="Revenue by Product"
                    checked={selectedCharts.barChart}
                    onChange={() => handleChartSelection('barChart')}
                  />
                </Col>
                <Col md={2} sm={4} xs={6} className="mb-2">
                  <Form.Check
                    type="checkbox"
                    id="pieChart-pp"
                    label="Revenue by Store"
                    checked={selectedCharts.pieChart}
                    onChange={() => handleChartSelection('pieChart')}
                  />
                </Col>
                <Col md={2} sm={4} xs={6} className="mb-2">
                  <Form.Check
                    type="checkbox"
                    id="doughnutChart-pp"
                    label="Units by Category"
                    checked={selectedCharts.doughnutChart}
                    onChange={() => handleChartSelection('doughnutChart')}
                  />
                </Col>
                <Col md={2} sm={4} xs={6} className="mb-2">
                  <Form.Check
                    type="checkbox"
                    id="treemapChart-pp"
                    label="Revenue Treemap"
                    checked={selectedCharts.treemapChart}
                    onChange={() => handleChartSelection('treemapChart')}
                  />
                </Col>
                <Col md={2} sm={4} xs={6} className="mb-2">
                  <Form.Check
                    type="checkbox"
                    id="histogramChart-pp"
                    label="Revenue Distribution"
                    checked={selectedCharts.histogramChart}
                    onChange={() => handleChartSelection('histogramChart')}
                  />
                </Col>
                <Col md={2} sm={4} xs={6} className="mb-2">
                  <Form.Check
                    type="checkbox"
                    id="dataTable-pp"
                    label="Data Table"
                    checked={selectedCharts.dataTable}
                    onChange={() => handleChartSelection('dataTable')}
                  />
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* All graphs in individual rows for better visibility */}
      {selectedCharts.lineChart && (
        <Row>
          <Col lg={8} md={10} sm={12} className="mb-4">
            <Card>
              <Card.Body className="chart-container p-0" style={{ height: "350px" }}>
                <div ref={lineRef} style={{ width: "99%", height: "99%" }}></div>
              </Card.Body>
              <Card.Footer className="text-center small">Total Revenue Over Time</Card.Footer>
            </Card>
          </Col>
        </Row>
      )}

      {selectedCharts.barChart && (
        <Row>
          <Col lg={8} md={10} sm={12} className="mb-4">
            <Card>
              <Card.Body className="chart-container p-0" style={{ height: "350px" }}>
                <div ref={barRef} style={{ width: "99%", height: "99%" }}></div>
              </Card.Body>
              <Card.Footer className="text-center small">Revenue by Product</Card.Footer>
            </Card>
          </Col>
        </Row>
      )}

      {selectedCharts.pieChart && (
        <Row>
          <Col lg={6} md={8} sm={12} className="mb-4">
            <Card>
              <Card.Body className="chart-container p-0" style={{ height: "400px" }}>
                <div ref={pieRef} style={{ width: "99%", height: "99%" }}></div>
              </Card.Body>
              <Card.Footer className="text-center small">Revenue by Store</Card.Footer>
            </Card>
          </Col>
        </Row>
      )}

      {selectedCharts.doughnutChart && (
        <Row>
          <Col lg={6} md={8} sm={12} className="mb-4">
            <Card>
              <Card.Body className="chart-container p-0" style={{ height: "400px" }}>
                <div ref={doughnutRef} style={{ width: "99%", height: "99%" }}></div>
              </Card.Body>
              <Card.Footer className="text-center small">Units Sold by Category</Card.Footer>
            </Card>
          </Col>
        </Row>
      )}

      {selectedCharts.treemapChart && (
        <Row>
          <Col lg={10} md={12} className="mb-4">
            <Card>
              <Card.Body className="chart-container p-0" style={{ height: "450px" }}>
                <div ref={treemapRef} style={{ width: "99%", height: "99%" }}></div>
              </Card.Body>
              <Card.Footer className="text-center small">Revenue Treemap</Card.Footer>
            </Card>
          </Col>
        </Row>
      )}

      {selectedCharts.histogramChart && (
        <Row>
          <Col lg={8} md={10} sm={12} className="mb-4">
            <Card>
              <Card.Body className="chart-container p-0" style={{ height: "350px" }}>
                <div ref={histogramRef} style={{ width: "99%", height: "99%" }}></div>
              </Card.Body>
              <Card.Footer className="text-center small">Revenue Distribution</Card.Footer>
            </Card>
          </Col>
        </Row>
      )}

      {selectedCharts.dataTable && (
        <div ref={tableRef} className="mt-4">
          <div className="table-responsive">
            <Table striped bordered hover size="sm">
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
        </div>
      )}
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
    <Container className="mt-5 px-3" style={{ maxWidth: 400 }}>
      <Card>
        <Card.Body>
          <h2 className="text-center mb-4">Login</h2>
          {error && <Alert variant="danger" className="text-center">{error}</Alert>}
          <Form.Control
            className="my-2"
            placeholder="Username"
            value={user}
            onChange={e => setUser(e.target.value)}
            size="sm"
          />
          <Form.Control
            className="my-2"
            placeholder="Password"
            type="password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            size="sm"
          />
          <Button onClick={login} className="w-100 mb-2" size="sm">Login</Button>
          <div className="my-2 text-center small">or</div>
          {/* Google Login Button */}
          <div className="d-flex justify-content-center">
            <GoogleLogin
              onSuccess={onGoogleSuccess}
              onError={() => setError("Google login failed")}
              width="300"
            />
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [persona, setPersona] = useState("");
  const [loginName, setLoginName] = useState("");
  const [selectedDashboard, setSelectedDashboard] = useState("sales");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("token");
    if (urlToken) {
      setToken(urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);
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
      <Navbar bg="dark" variant="dark" expand="lg">
        <Container fluid>
          <Navbar.Brand>BI Dashboard</Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            {persona && (
              <Navbar.Text style={{ color: "#FFD700" }} className="me-auto">
                &nbsp;Persona: <b>{persona}</b>
              </Navbar.Text>
            )}
            <Button 
              variant="outline-light" 
              size="sm" 
              onClick={() => {
                localStorage.removeItem('token');
                setToken('');
              }}
              className="ms-auto"
            >
              Logout
            </Button>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      {token ? (
        <div className="d-flex flex-column flex-lg-row" style={{ minHeight: "calc(100vh - 56px)" }}>
          <Nav
            variant="pills"
            className="flex-lg-column p-2 p-lg-3 mobile-stack bg-light"
            style={{
              borderRight: "none",
              borderBottom: "1px solid #eee"
            }}
            activeKey={selectedDashboard}
            onSelect={setSelectedDashboard}
          >
            {dashboards.map(d => (
              <Nav.Link
                key={d.key}
                eventKey={d.key}
                className="mb-1 mb-lg-2 text-center text-lg-start"
                style={{
                  fontWeight: selectedDashboard === d.key ? "bold" : "normal",
                  fontSize: "0.9rem"
                }}
              >
                {d.label}
              </Nav.Link>
            ))}
          </Nav>
          <div style={{ flex: 1, minWidth: 0 }} className="overflow-auto">
            <DashboardComponent
              token={token}
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

// Histogram chart drawing function
function drawHistogram(container, { data, bins = 10, xLabel = "Value", yLabel = "Frequency" }) {
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

  // Create histogram data
  const x = d3.scaleLinear()
    .domain(d3.extent(data))
    .range([margin.left, width - margin.right]);

  const histogram = d3.histogram()
    .value(d => d)
    .domain(x.domain())
    .thresholds(bins);

  const binData = histogram(data);

  const y = d3.scaleLinear()
    .domain([0, d3.max(binData, d => d.length)])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const g = svg.append("g");

  // Add x-axis
  g.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .selectAll("text")
    .style("font-size", "11px");

  // Add y-axis
  g.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y))
    .selectAll("text")
    .style("font-size", "11px");

  // Add bars
  g.selectAll(".bar")
    .data(binData)
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", d => x(d.x0))
    .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1))
    .attr("y", d => y(d.length))
    .attr("height", d => y(0) - y(d.length))
    .attr("fill", "#ff6384")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1);

  // Add axis labels
  g.append("text")
    .attr("transform", `translate(${(margin.left + width - margin.right) / 2}, ${height - 5})`)
    .style("text-anchor", "middle")
    .style("font-size", "12px")
    .text(xLabel);

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", 15)
    .attr("x", 0 - (height / 2))
    .style("text-anchor", "middle")
    .style("font-size", "12px")
    .text(yLabel);
}
