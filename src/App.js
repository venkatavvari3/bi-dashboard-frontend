import React, { useState, useEffect, useRef, useMemo } from "react";
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

// Utility function to convert SVG to PNG data URL
const svgToPngDataUrl = async (svgElement) => {
  try {
    console.log('Converting SVG to PNG...', svgElement);
    
    // Create a canvas element
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Get SVG dimensions - try multiple methods
    let svgWidth = 400;
    let svgHeight = 300;
    
    // Method 1: Try getBoundingClientRect
    const svgRect = svgElement.getBoundingClientRect();
    if (svgRect.width > 0 && svgRect.height > 0) {
      svgWidth = svgRect.width;
      svgHeight = svgRect.height;
    } else {
      // Method 2: Try getAttribute
      const widthAttr = svgElement.getAttribute('width');
      const heightAttr = svgElement.getAttribute('height');
      if (widthAttr && heightAttr) {
        svgWidth = parseFloat(widthAttr);
        svgHeight = parseFloat(heightAttr);
      } else {
        // Method 3: Try viewBox
        const viewBox = svgElement.getAttribute('viewBox');
        if (viewBox) {
          const [, , width, height] = viewBox.split(' ').map(Number);
          if (width && height) {
            svgWidth = width;
            svgHeight = height;
          }
        }
      }
    }
    
    console.log('SVG dimensions:', svgWidth, 'x', svgHeight);
    
    // Set canvas dimensions with device pixel ratio for better quality
    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = svgWidth * devicePixelRatio;
    canvas.height = svgHeight * devicePixelRatio;
    canvas.style.width = svgWidth + 'px';
    canvas.style.height = svgHeight + 'px';
    ctx.scale(devicePixelRatio, devicePixelRatio);
    
    // Get SVG as string and clean it up
    let svgData = new XMLSerializer().serializeToString(svgElement);
    
    // Ensure SVG has proper namespace and dimensions
    if (!svgData.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgData = svgData.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    
    // Set explicit width and height if not present
    if (!svgData.includes('width=') || !svgData.includes('height=')) {
      svgData = svgData.replace('<svg', `<svg width="${svgWidth}" height="${svgHeight}"`);
    }
    
    console.log('SVG data length:', svgData.length);
    
    // Try using Canvg first
    try {
      const v = Canvg.fromString(ctx, svgData);
      await v.render();
      console.log('Canvg conversion successful');
    } catch (canvgError) {
      console.warn('Canvg failed, trying alternative method:', canvgError);
      
      // Alternative method: use img element with SVG data URL
      const img = new Image();
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      
      await new Promise((resolve, reject) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0, svgWidth, svgHeight);
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = reject;
        img.src = url;
      });
      
      console.log('Alternative conversion successful');
    }
    
    // Convert canvas to PNG data URL
    const dataUrl = canvas.toDataURL('image/png');
    console.log('PNG conversion complete, data URL length:', dataUrl.length);
    return dataUrl;
    
  } catch (error) {
    console.error('Error converting SVG to PNG:', error);
    console.error('SVG element:', svgElement);
    
    // Fallback: create a simple placeholder image
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#333';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Chart Export Error', canvas.width / 2, canvas.height / 2);
    return canvas.toDataURL('image/png');
  }
};

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
  // Validate data before rendering
  if (!labels || !values || labels.length === 0 || values.length === 0) {
    d3.select(container).selectAll("*").remove();
    d3.select(container)
      .append("div")
      .style("text-align", "center")
      .style("padding", "20px")
      .style("color", "#666")
      .text("No data available for bar chart");
    return;
  }
  
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
  console.log('Pie chart data:', { labels, values }); // Debug log
  
  // Validate data before rendering
  if (!labels || !values || labels.length === 0 || values.length === 0) {
    d3.select(container).selectAll("*").remove();
    d3.select(container)
      .append("div")
      .style("text-align", "center")
      .style("padding", "20px")
      .style("color", "#666")
      .text("No data available for pie chart");
    return;
  }
  
  const width = (container.offsetWidth || 320) * 0.99;
  const height = (container.offsetHeight || 200) * 0.99;
  
  console.log('Container dimensions:', { width, height }); // Debug log
  
  // Dynamically adjust layout based on number of items and container size
  const numItems = labels.length;
  const legendColumns = numItems > 8 ? 4 : 3;
  const legendRows = Math.ceil(numItems / legendColumns);
  const legendItemHeight = numItems > 12 ? 16 : 20;
  const legendHeight = legendRows * legendItemHeight + 15;
  
  // Reserve space for external labels - need more horizontal margin
  const labelMargin = 80; // Space for external labels on both sides
  const chartHeight = height - legendHeight - 40;
  const chartWidth = width - (labelMargin * 2); // Reduce effective width for labels
  
  // Calculate radius to fit within boundaries including label space
  const maxRadius = Math.min(chartWidth * 0.25, chartHeight * 0.35); // Reduced to leave space for labels
  const radius = numItems > 12 ? maxRadius * 0.9 : maxRadius;
  
  console.log('Chart dimensions:', { chartHeight, radius }); // Debug log
  
  d3.select(container).selectAll("*").remove();
  const svg = d3.select(container)
    .append("svg")
    .attr("width", "99%")
    .attr("height", "99%")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("display", "block");
  const g = svg.append("g")
    .attr("transform", `translate(${width / 2},${chartHeight / 2 + 20})`); // Center in available chart space

  // Calculate total for percentage calculations
  const total = values.reduce((sum, value) => sum + value, 0);
  
  const pie = d3.pie()
    .value(d => d)
    .sort(null); // Maintain original order
    
  const arc = d3.arc()
    .innerRadius(0)
    .outerRadius(radius);
    
  const outerArc = d3.arc()
    .innerRadius(radius * 1.1) // Reduced from 1.3 to fit better
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

  // No internal labels - all labels will be external for better visibility

  // Add labels and leader lines for ALL slices (external labels within boundaries)
  const labelLines = slices.append("polyline")
    .attr("stroke", "#666")
    .attr("stroke-width", 1)
    .attr("fill", "none")
    .attr("points", d => {
      // Calculate label position within chart boundaries
      const pos = outerArc.centroid(d);
      const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
      const labelDistance = radius * 1.3;
      let labelX = labelDistance * (midAngle < Math.PI ? 1 : -1);
      
      // Ensure leader line endpoints stay within boundaries
      const maxLabelX = (width / 2) - 10;
      labelX = Math.max(-maxLabelX, Math.min(maxLabelX, labelX));
      
      return [arc.centroid(d), outerArc.centroid(d), [labelX, pos[1]]];
    });

  // Add external labels for ALL slices - positioned within chart boundaries
  slices.append("text")
    .attr("transform", d => {
      // Position labels within available space
      const pos = outerArc.centroid(d);
      const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
      const labelDistance = radius * 1.3; // Reduced from 1.5 to ensure labels stay within bounds
      pos[0] = labelDistance * (midAngle < Math.PI ? 1 : -1);
      
      // Ensure labels don't exceed chart boundaries
      const maxLabelX = (width / 2) - 10; // Leave 10px margin from edge
      pos[0] = Math.max(-maxLabelX, Math.min(maxLabelX, pos[0]));
      
      return `translate(${pos})`;
    })
    .style("text-anchor", d => {
      // Position text based on which side of the chart
      const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
      return midAngle < Math.PI ? "start" : "end";
    })
    .style("font-size", numItems > 12 ? "8px" : numItems > 8 ? "9px" : "10px") // Smaller fonts for better boundary fit
    .style("font-weight", "bold")
    .style("fill", "#333")
    .text((d, i) => {
      // Show label for ALL slices with percentage and value - more compact for boundary fit
      const percentage = (d.data / total * 100);
      const value = d.data;
      let valueStr;
      if (value >= 1000000) {
        valueStr = `$${(value / 1000000).toFixed(1)}M`;
      } else if (value >= 1000) {
        valueStr = `$${(value / 1000).toFixed(0)}k`;
      } else {
        valueStr = `$${value.toLocaleString()}`;
      }
      
      // More aggressive truncation to fit within chart boundaries
      const maxLabelLength = numItems > 12 ? 6 : numItems > 8 ? 8 : 12; // Shorter labels for more items
      const labelName = labels[i].length > maxLabelLength ? 
        labels[i].substring(0, maxLabelLength - 2) + "..." : 
        labels[i];
      
      // Create compact label format
      return `${labelName} (${percentage.toFixed(1)}%, ${valueStr})`;
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
    .attr("transform", (d, i) => {
      const col = i % legendColumns;
      const row = Math.floor(i / legendColumns);
      const colWidth = (width - 20) / legendColumns;
      return `translate(${col * colWidth}, ${row * legendItemHeight})`;
    });

  legendItems.append("rect")
    .attr("width", 10)
    .attr("height", 10)
    .attr("fill", (d, i) => colors[i % colors.length]);

  legendItems.append("text")
    .attr("x", 14)
    .attr("y", 5)
    .attr("dy", "0.35em")
    .style("font-size", numItems > 12 ? "8px" : "10px") // Smaller font for many items
    .style("fill", "#333")
    .text((d, i) => {
      // Just show the label name, truncated if necessary
      const colWidth = (width - 20) / legendColumns;
      const maxLength = Math.floor((colWidth - 20) / (numItems > 12 ? 5 : 6)); // Adjust for font size
      return d.length > maxLength ? d.substring(0, maxLength - 2) + "..." : d;
    });
}

function drawLineChart(container, { labels, values }) {
  // Validate data before rendering
  if (!labels || !values || labels.length === 0 || values.length === 0) {
    d3.select(container).selectAll("*").remove();
    d3.select(container)
      .append("div")
      .style("text-align", "center")
      .style("padding", "20px")
      .style("color", "#666")
      .text("No data available for line chart");
    return;
  }
  
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
  // Validate data before rendering
  if (!labels || !values || labels.length === 0 || values.length === 0) {
    d3.select(container).selectAll("*").remove();
    d3.select(container)
      .append("div")
      .style("text-align", "center")
      .style("padding", "20px")
      .style("color", "#666")
      .text("No data available for doughnut chart");
    return;
  }
  
  const width = (container.offsetWidth || 320) * 0.99;
  const height = (container.offsetHeight || 200) * 0.99;
  const numItems = labels.length;
  const legendColumns = numItems > 8 ? 4 : 3;
  const legendRows = Math.ceil(numItems / legendColumns);
  const legendItemHeight = 20;
  const legendHeight = legendRows * legendItemHeight + 10;
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

  // Add percentage and category labels inside slices for larger slices
  slices.append("text")
    .attr("transform", d => `translate(${arc.centroid(d)})`)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .style("font-size", "9px")
    .style("font-weight", "bold")
    .style("fill", "white")
    .style("text-shadow", "1px 1px 2px rgba(0,0,0,0.8)")
    .text((d, i) => {
      const percentage = (d.data / total * 100);
      // Show category name and percentage inside if slice is large enough (> 8% for doughnut)
      if (percentage > 8) {
        const categoryName = labels[i].length > 8 ? labels[i].substring(0, 6) + "..." : labels[i];
        return `${categoryName}`;
      }
      return "";
    });

  // Add percentage on second line for larger slices
  slices.append("text")
    .attr("transform", d => `translate(${arc.centroid(d)[0]}, ${arc.centroid(d)[1] + 11})`)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .style("font-size", "8px")
    .style("font-weight", "normal")
    .style("fill", "white")
    .style("text-shadow", "1px 1px 2px rgba(0,0,0,0.8)")
    .text(d => {
      const percentage = (d.data / total * 100);
      // Show percentage and units inside if slice is large enough
      return percentage > 8 ? `${percentage.toFixed(1)}% (${d.data.toLocaleString()})` : "";
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

  // Add external labels for small slices - ensure category names are shown
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
    .style("font-size", "9px")
    .style("font-weight", "bold")
    .style("fill", "#333")
    .text((d, i) => {
      const percentage = (d.data / total * 100);
      if (percentage <= 8) {
        const units = d.data.toLocaleString();
        const categoryName = labels[i].length > 10 ? labels[i].substring(0, 8) + "..." : labels[i];
        return `${categoryName} (${percentage.toFixed(1)}%, ${units})`;
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
    .attr("transform", (d, i) => {
      const col = i % legendColumns;
      const row = Math.floor(i / legendColumns);
      const colWidth = (width - 20) / legendColumns;
      return `translate(${col * colWidth}, ${row * legendItemHeight})`;
    });

  legendItems.append("rect")
    .attr("width", 10)
    .attr("height", 10)
    .attr("fill", (d, i) => colors[i % colors.length]);

  legendItems.append("text")
    .attr("x", 14)
    .attr("y", 5)
    .attr("dy", "0.35em")
    .style("font-size", numItems > 12 ? "8px" : "10px") // Smaller font for many items
    .style("fill", "#333")
    .text((d, i) => {
      // Just show the label name, truncated if necessary
      const colWidth = (width - 20) / legendColumns;
      const maxLength = Math.floor((colWidth - 20) / (numItems > 12 ? 5 : 6)); // Adjust for font size
      return d.length > maxLength ? d.substring(0, maxLength - 2) + "..." : d;
    });
}

// --- Main Dashboard Component ---
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
    bubbleChart: true,
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
      bubbleChart: selectAll,
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
      bubbleChart: true,
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

const bubbleRef = useD3Chart(
  drawBubbleChart,
  {
    data: data
      .filter(row =>
        (selectedProduct ? row.product_name === selectedProduct : true) &&
        (selectedStore ? row.store_name === selectedStore : true)
      ),
    labelKey: "product_name"
  },
  [data, selectedProduct, selectedStore, chartRenderKey]
);

  // Fetch products and stores
  useEffect(() => {
    axios.get(`${API_URL}/api/products`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setProducts(res.data))
      .catch(error => {
        console.error('Products API Error:', error);
        setProducts([]);
      });
    axios.get(`${API_URL}/api/stores`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setStores(res.data))
      .catch(error => {
        console.error('Stores API Error:', error);
        setStores([]);
      });
  }, [token]);

  // Fetch data
  const fetchData = () => {
    setLoading(true);
    axios.get(`${API_URL}/api/data`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        setData(res.data);
        setError("");
      })
      .catch(error => {
        console.error('API Error:', error);
        if (error.response?.status === 500) {
          setError("Backend server error (500). Please check if the backend server is running and properly configured.");
        } else if (error.response?.status === 503) {
          setError("Backend service unavailable (503). The server may be down or overloaded.");
        } else if (error.code === 'ECONNREFUSED') {
          setError("Cannot connect to backend server. Please check if the server is running on the correct port.");
        } else {
          setError(`Failed to fetch data: ${error.message || 'Unknown error'}`);
        }
      })
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
    const pageHeight = doc.internal.pageSize.getHeight();

    // Page 1: Charts
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(
      `Filters: Product = ${selectedProduct || "All"}, Store = ${selectedStore || "All"}`,
      margin,
      margin
    );

    // Chart dimensions - larger since we're doing one per row
    const chartWidth = 300;
    const chartHeight = 200;
    const chartSpacing = 30;
    const titleHeight = 20;
    let currentY = margin + 30;

    const chartRefs = [lineRef, barRef, pieRef, doughnutRef];
    const chartTitles = [
      "Total Revenue Over Time",
      "Revenue by Product",
      "Revenue by Store",
      "Units Sold by Category",
    ];

    // Center each chart horizontally
    const chartX = (pageWidth - chartWidth) / 2;

    for (let i = 0; i < chartRefs.length; i++) {
      const chartRef = chartRefs[i];
      const title = chartTitles[i];

      console.log(`Processing chart ${i}: ${title}`, chartRef);

      // Check if we need a new page (leave space for chart + title + spacing)
      if (currentY + chartHeight + titleHeight + chartSpacing > pageHeight - margin) {
        doc.addPage();
        currentY = margin;
      }

      if (chartRef.current) {
        const svg = chartRef.current.querySelector("svg");
        console.log(`SVG found for ${title}:`, svg);
        
        if (svg) {
          try {
            console.log(`Converting ${title} to PNG...`);
            const chartImg = await svgToPngDataUrl(svg);
            console.log(`${title} conversion result:`, chartImg.substring(0, 50) + '...');
            
            // Add the chart image
            doc.addImage(chartImg, "PNG", chartX, currentY, chartWidth, chartHeight);
            
            // Add the title below the chart
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text(title, pageWidth / 2, currentY + chartHeight + 15, { align: "center" });
            doc.setFont("helvetica", "normal");
            doc.setFontSize(12);
            
            console.log(`${title} added to PDF successfully`);
            
            // Move to next row position
            currentY += chartHeight + titleHeight + chartSpacing;
            
          } catch (error) {
            console.error(`Error processing chart ${title}:`, error);
            // Add a placeholder for failed charts
            doc.setFillColor(240, 240, 240);
            doc.rect(chartX, currentY, chartWidth, chartHeight, 'F');
            doc.setTextColor(100, 100, 100);
            doc.text('Chart Error', pageWidth / 2, currentY + chartHeight / 2, { align: "center" });
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text(title, pageWidth / 2, currentY + chartHeight + 15, { align: "center" });
            doc.setFont("helvetica", "normal");
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            
            // Move to next row position
            currentY += chartHeight + titleHeight + chartSpacing;
          }
        } else {
          console.warn(`No SVG found for ${title}`);
          // Add a placeholder for missing SVG
          doc.setFillColor(250, 250, 250);
          doc.rect(chartX, currentY, chartWidth, chartHeight, 'F');
          doc.setTextColor(150, 150, 150);
          doc.text('No Chart', pageWidth / 2, currentY + chartHeight / 2, { align: "center" });
          doc.setFont("helvetica", "bold");
          doc.setFontSize(14);
          doc.text(title, pageWidth / 2, currentY + chartHeight + 15, { align: "center" });
          doc.setFont("helvetica", "normal");
          doc.setFontSize(12);
          doc.setTextColor(0, 0, 0);
          
          // Move to next row position
          currentY += chartHeight + titleHeight + chartSpacing;
        }
      } else {
        console.warn(`Chart ref not available for ${title}`);
        // Add a placeholder for missing chart ref
        doc.setFillColor(250, 250, 250);
        doc.rect(chartX, currentY, chartWidth, chartHeight, 'F');
        doc.setTextColor(150, 150, 150);
        doc.text('Chart Not Ready', pageWidth / 2, currentY + chartHeight / 2, { align: "center" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text(title, pageWidth / 2, currentY + chartHeight + 15, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        
        // Move to next row position
        currentY += chartHeight + titleHeight + chartSpacing;
      }
    }
    
   // Add a new page for the table
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

  // Helper function to generate email attachments based on format choice
  const generateEmailAttachments = async (includeFormats = ['pdf', 'excel']) => {
    console.log("generateEmailAttachments called with formats:", includeFormats);
    const attachments = {};
    
    // Always include screenshot
    console.log("Generating screenshot...");
    const canvas = await html2canvas(document.body);
    attachments.image = canvas.toDataURL("image/png");
    console.log("Screenshot generated, size:", attachments.image.length);
    
    // Conditionally include PDF
    if (includeFormats.includes('pdf')) {
      console.log("Generating PDF...");
      const doc = new jsPDF("p", "pt", "a4");
      const margin = 40;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.text(
        `Filters: Product = ${selectedProduct || "All"}, Store = ${selectedStore || "All"}`,
        margin,
        margin
      );

      const chartWidth = 300;
      const chartHeight = 200;
      const chartSpacing = 30;
      const titleHeight = 20;
      let currentY = margin + 30;

      const selectedChartData = [];
      if (selectedCharts.lineChart) selectedChartData.push({ ref: lineRef, title: "Total Revenue Over Time" });
      if (selectedCharts.barChart) selectedChartData.push({ ref: barRef, title: "Revenue by Product" });
      if (selectedCharts.pieChart) selectedChartData.push({ ref: pieRef, title: "Revenue by Store" });
      if (selectedCharts.doughnutChart) selectedChartData.push({ ref: doughnutRef, title: "Units Sold by Category" });
      if (selectedCharts.treemapChart) selectedChartData.push({ ref: treemapRef, title: "Revenue by Category and Product" });
      if (selectedCharts.histogramChart) selectedChartData.push({ ref: histogramRef, title: "Revenue Distribution" });
      if (selectedCharts.bubbleChart) selectedChartData.push({ ref: bubbleRef, title: "Cumulative Profit by Product" });

      for (let i = 0; i < selectedChartData.length; i++) {
        const { ref, title } = selectedChartData[i];
        
        if (ref.current) {
          const svg = ref.current.querySelector("svg");
          if (svg) {
            try {
              const dataUrl = await svgToPngDataUrl(svg, chartWidth, chartHeight);
              
              if (currentY + chartHeight + titleHeight > pageHeight - margin) {
                doc.addPage();
                currentY = margin;
              }
              
              doc.setFontSize(10);
              doc.text(title, margin, currentY);
              currentY += titleHeight;
              
              doc.addImage(dataUrl, "PNG", margin, currentY, chartWidth, chartHeight);
              currentY += chartHeight + chartSpacing;
            } catch (error) {
              console.error(`Error converting ${title} to image:`, error);
            }
          }
        }
      }

      const pdfBlob = doc.output('blob');
      console.log("PDF blob created, size:", pdfBlob.size);
      attachments.pdf = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result.split(',')[1];
          console.log("PDF base64 generated, length:", base64.length);
          resolve(base64);
        };
        reader.readAsDataURL(pdfBlob);
      });
      console.log("PDF generation completed");
    }
    
    // Conditionally include Excel
    if (includeFormats.includes('excel')) {
      console.log("Generating Excel with two tabs...");
      const workbook = new ExcelJS.Workbook();
      
      // Sheet 1: Dataset
      const tableSheet = workbook.addWorksheet("Dataset");
      tableSheet.addRow([`Filters: Product = ${selectedProduct || "All"}, Store = ${selectedStore || "All"}`]);
      tableSheet.addRow([]); // Empty row

      // Add table headers
      if (filteredData.length > 0) {
        tableSheet.addRow(Object.keys(filteredData[0])); // Header row
        tableSheet.addRows(filteredData.map(Object.values)); // Data rows
        console.log("Excel data added, rows:", filteredData.length);
      } else {
        console.log("No filtered data for Excel");
      }

      // Sheet 2: Charts
      const chartSheet = workbook.addWorksheet("Visuals");
      chartSheet.addRow([`Filters: Product = ${selectedProduct || "All"}, Store = ${selectedStore || "All"}`]);

      const addChartToSheet = async (chartRef, title, colOffset) => {
        if (chartRef.current) {
          const svg = chartRef.current.querySelector("svg");
          if (svg) {
            try {
              console.log(`Adding ${title} to Excel Visuals sheet...`);
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
              
              console.log(`${title} added to Excel successfully`);
            } catch (error) {
              console.error(`Error adding ${title} to Excel:`, error);
            }
          }
        }
      };

      // Use column offsets to place charts side by side - Include ALL selected charts like PDF
      let colOffset = 0;
      const selectedChartData = [];
      if (selectedCharts.lineChart) selectedChartData.push({ ref: lineRef, title: "Total Revenue Over Time" });
      if (selectedCharts.barChart) selectedChartData.push({ ref: barRef, title: "Revenue by Product" });
      if (selectedCharts.pieChart) selectedChartData.push({ ref: pieRef, title: "Revenue by Store" });
      if (selectedCharts.doughnutChart) selectedChartData.push({ ref: doughnutRef, title: "Units Sold by Category" });
      if (selectedCharts.treemapChart) selectedChartData.push({ ref: treemapRef, title: "Revenue by Category and Product" });
      if (selectedCharts.histogramChart) selectedChartData.push({ ref: histogramRef, title: "Revenue Distribution" });
      if (selectedCharts.bubbleChart) selectedChartData.push({ ref: bubbleRef, title: "Cumulative Profit by Product" });

      // Add all selected charts to Excel with proper spacing
      for (const { ref, title } of selectedChartData) {
        await addChartToSheet(ref, title, colOffset);
        colOffset += 5; // Move to next column position
      }

      const excelBuffer = await workbook.xlsx.writeBuffer();
      console.log("Excel buffer created with two tabs, size:", excelBuffer.byteLength);
      // Convert ArrayBuffer to base64 string in browser-compatible way
      const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      attachments.excel = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result.split(',')[1];
          console.log("Excel base64 generated, length:", base64.length);
          resolve(base64);
        };
        reader.readAsDataURL(blob);
      });
      console.log("Excel generation with two tabs completed");
    }
    
    console.log("generateEmailAttachments completed with keys:", Object.keys(attachments));
    return attachments;
  };

  const handleEmailMe = async () => {
    if (!email) {
      alert("Please enter an email address.");
      return;
    }

    try {
      console.log("Starting email attachment generation...");
      // Generate email attachments
      const attachments = await generateEmailAttachments(['pdf', 'excel']);
      console.log("Email attachments generated successfully:", Object.keys(attachments));
      console.log("Attachment sizes:", {
        image: attachments.image ? attachments.image.length : 0,
        pdf: attachments.pdf ? attachments.pdf.length : 0,
        excel: attachments.excel ? attachments.excel.length : 0
      });
      
      const emailData = {
        to: email,
        message: "Please find attached dashboard with PDF and Excel reports",
        image: attachments.image,
        pdf: attachments.pdf,
        excel: attachments.excel,
      };
      
      console.log("Sending email with data:", {
        to: emailData.to,
        message: emailData.message,
        hasImage: !!emailData.image,
        hasPdf: !!emailData.pdf,
        hasExcel: !!emailData.excel
      });
      
      await axios.post(`${API_URL}/api/email_me`, emailData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      alert("Dashboard emailed with PDF and Excel attachments!");
      setShowEmailForm(false);
      setEmail("");
    } catch (e) {
      console.error("Failed to send email:", e);
      alert("Failed to send email");
    }
  };


  
const handleSubscribeSubmit = async () => {
  if (!reportFormat) {
    alert("Please select a report format.");
    return;
  }
  
  try {
    const payload = {
      repeatFrequency,
      scheduledTime,
      reportFormat, // User's choice: 'pdf', 'excel', or 'both'
      email: loginName || "",  // use logged-in user email if available
    };
    await axios.post(`${API_URL}/api/schedule_report`, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    let formatMessage = "";
    switch(reportFormat) {
      case "pdf":
        formatMessage = "PDF reports";
        break;
      case "excel":
        formatMessage = "Excel reports";
        break;
      case "both":
        formatMessage = "both PDF and Excel reports";
        break;
    }
    
    alert(`Subscription scheduled successfully! You will receive ${formatMessage}.`);
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
              <small className="text-muted mb-2 d-block">Scheduled reports will include screenshot plus your selected format(s)</small>
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
                <option value="pdf">PDF Only</option>
                <option value="excel">Excel Only</option>
                <option value="both">Both PDF and Excel</option>
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
              id="bubbleChart"
              label="Cumulative Profit by Product"
              checked={selectedCharts.bubbleChart}
              onChange={() => handleChartSelection('bubbleChart')}
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

{selectedCharts.bubbleChart && (
  <Row>
    <Col lg={10} md={12} sm={12} className="mb-4"> {/* Increased from lg={8} to lg={10} for more width */}
      <Card>
        <Card.Body className="chart-container p-0" style={{ height: "500px" }}> {/* Increased from 400px to 500px */}
          <div ref={bubbleRef} style={{ width: "99%", height: "99%" }}></div>
        </Card.Body>
        <Card.Footer className="text-center small">Cumulative Profit by Product</Card.Footer>
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
                    <td>{Number(row.profit).toFixed(2)}</td>
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
    bubbleChart: true,
    dataTable: true
  });

  // Performance optimization for data table
  const [visibleRows, setVisibleRows] = useState(100); // Show first 100 rows by default

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
      bubbleChart: selectAll,
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
        bubbleChart: true,
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

  // Memoized filtered data to improve performance
  const filteredData = useMemo(() => {
    return data.filter(row =>
      (selectedProduct ? row.product_id === selectedProduct : true) &&
      (selectedStore ? row.store_name === selectedStore : true)
    );
  }, [data, selectedProduct, selectedStore]);

  // Reset visible rows when filters change
  useEffect(() => {
    setVisibleRows(100);
  }, [selectedProduct, selectedStore]);

  // Memoized chart data to avoid recalculating on every render
  const chartData = useMemo(() => {
    // Bar chart data - Products by Revenue
    const productIds = [...new Set(filteredData.map(row => row.product_id))];
    const productRevenues = productIds.map(productId => {
      return filteredData
        .filter(row => row.product_id === productId)
        .reduce((sum, row) => sum + Number(row.revenue), 0);
    });

    // Pie chart data - Stores by Revenue
    const storeNames = [...new Set(filteredData.map(row => row.store_name))];
    const storeRevenues = storeNames.map(storeName => {
      return filteredData
        .filter(row => row.store_name === storeName)
        .reduce((sum, row) => sum + Number(row.revenue), 0);
    });

    // Line chart data - Revenue by Date
    const dates = [...new Set(filteredData.map(row => row.date))].sort();
    const dateRevenues = dates.map(date => {
      return filteredData
        .filter(row => row.date === date)
        .reduce((sum, row) => sum + Number(row.revenue), 0);
    });

    // Doughnut chart data - Categories by Units Sold
    const categories = [...new Set(filteredData.map(row => row.category))];
    const categoryUnitsSold = categories.map(category => {
      return filteredData
        .filter(row => row.category === category)
        .reduce((sum, row) => sum + Number(row.units_sold), 0);
    });

    // Histogram data - Revenue values for distribution
    const revenueValues = filteredData.map(row => Number(row.revenue));

    // Bubble chart data - Product performance
    const bubbleData = productIds.map(productId => {
      const productRows = filteredData.filter(row => row.product_id === productId);
      const revenue = productRows.reduce((sum, row) => sum + Number(row.revenue), 0);
      const profit = productRows.reduce((sum, row) => sum + Number(row.profit), 0);
      const unitsSold = productRows.reduce((sum, row) => sum + Number(row.units_sold), 0);
      
      // Get the actual product name from the first row (all rows have same product_name for same product_id)
      const productName = productRows.length > 0 ? productRows[0].product_name : productId;
      
      return {
        id: productId,
        name: productName,
        revenue,
        profit,
        units_sold: unitsSold
      };
    });

    // Treemap data - Hierarchical view by Category > Product
    const treemapChildren = categories.map(category => ({
      name: category,
      children: productIds
        .filter(productId => {
          return filteredData.some(row => row.category === category && row.product_id === productId);
        })
        .map(productId => ({
          name: productId,
          value: filteredData
            .filter(row => row.category === category && row.product_id === productId)
            .reduce((sum, row) => sum + Number(row.revenue), 0)
        }))
        .filter(item => item.value > 0)
    })).filter(category => category.children.length > 0);

    return {
      bar: { labels: productIds, values: productRevenues },
      pie: { labels: storeNames, values: storeRevenues },
      line: { labels: dates, values: dateRevenues },
      doughnut: { labels: categories, values: categoryUnitsSold },
      histogram: revenueValues,
      bubble: bubbleData,
      treemap: { name: "root", children: treemapChildren }
    };
  }, [filteredData]);

  const barRef = useD3Chart(
    drawBarChart,
    chartData.bar,
    [chartData.bar]
  );

  const pieColors = ["#ff6384", "#ffce56", "#36a2eb", "#9966ff", "#4bc0c0"];
  const pieRef = useD3Chart(
    drawPieChart,
    { ...chartData.pie, colors: pieColors },
    [chartData.pie]
  );

  const lineRef = useD3Chart(
    drawLineChart,
    chartData.line,
    [chartData.line, chartRenderKey]
  );

  const doughnutColors = ["#ff6384", "#ffce56", "#36a2eb", "#4bc0c0"];
  const doughnutRef = useD3Chart(
    drawDoughnutChart,
    { ...chartData.doughnut, colors: doughnutColors },
    [chartData.doughnut, chartRenderKey]
  );

  const tableRef = useRef();

  const treemapRef = useD3Chart(
    drawTreemap,
    chartData.treemap,
    [chartData.treemap, chartRenderKey]
  );

  const histogramRef = useD3Chart(
    drawHistogram,
    { 
      data: chartData.histogram, 
      bins: 10, 
      xLabel: "Revenue", 
      yLabel: "Frequency" 
    },
    [chartData.histogram, chartRenderKey]
  );

  const bubbleRef = useD3Chart(
    drawBubbleChart,
    {
      data: chartData.bubble,
      labelKey: "product_name"
    },
    [chartData.bubble, chartRenderKey]
  );

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
    const pageHeight = doc.internal.pageSize.getHeight();

    // Page 1: Charts
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(
      `Filters: Product = ${selectedProduct || "All"}, Store = ${selectedStore || "All"}`,
      margin,
      margin
    );

    // Chart dimensions - larger since we're doing one per row
    const chartWidth = 300;
    const chartHeight = 200;
    const chartSpacing = 30;
    const titleHeight = 20;
    let currentY = margin + 30;

    const chartRefs = [lineRef, barRef, pieRef, doughnutRef];
    const chartTitles = [
      "Total Revenue Over Time",
      "Revenue by Product",
      "Revenue by Store",
      "Units Sold by Category",
    ];

    // Center each chart horizontally
    const chartX = (pageWidth - chartWidth) / 2;

    for (let i = 0; i < chartRefs.length; i++) {
      const chartRef = chartRefs[i];
      const title = chartTitles[i];

      console.log(`Processing chart ${i}: ${title}`, chartRef);

      // Check if we need a new page (leave space for chart + title + spacing)
      if (currentY + chartHeight + titleHeight + chartSpacing > pageHeight - margin) {
        doc.addPage();
        currentY = margin;
      }

      if (chartRef.current) {
        const svg = chartRef.current.querySelector("svg");
        console.log(`SVG found for ${title}:`, svg);
        
        if (svg) {
          try {
            console.log(`Converting ${title} to PNG...`);
            const chartImg = await svgToPngDataUrl(svg);
            console.log(`${title} conversion result:`, chartImg.substring(0, 50) + '...');
            
            // Add the chart image
            doc.addImage(chartImg, "PNG", chartX, currentY, chartWidth, chartHeight);
            
            // Add the title below the chart
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text(title, pageWidth / 2, currentY + chartHeight + 15, { align: "center" });
            doc.setFont("helvetica", "normal");
            doc.setFontSize(12);
            
            console.log(`${title} added to PDF successfully`);
            
            // Move to next row position
            currentY += chartHeight + titleHeight + chartSpacing;
            
          } catch (error) {
            console.error(`Error processing chart ${title}:`, error);
            // Add a placeholder for failed charts
            doc.setFillColor(240, 240, 240);
            doc.rect(chartX, currentY, chartWidth, chartHeight, 'F');
            doc.setTextColor(100, 100, 100);
            doc.text('Chart Error', pageWidth / 2, currentY + chartHeight / 2, { align: "center" });
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text(title, pageWidth / 2, currentY + chartHeight + 15, { align: "center" });
            doc.setFont("helvetica", "normal");
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            
            // Move to next row position
            currentY += chartHeight + titleHeight + chartSpacing;
          }
        } else {
          console.warn(`No SVG found for ${title}`);
          // Add a placeholder for missing SVG
          doc.setFillColor(250, 250, 250);
          doc.rect(chartX, currentY, chartWidth, chartHeight, 'F');
          doc.setTextColor(150, 150, 150);
          doc.text('No Chart', pageWidth / 2, currentY + chartHeight / 2, { align: "center" });
          doc.setFont("helvetica", "bold");
          doc.setFontSize(14);
          doc.text(title, pageWidth / 2, currentY + chartHeight + 15, { align: "center" });
          doc.setFont("helvetica", "normal");
          doc.setFontSize(12);
          doc.setTextColor(0, 0, 0);
          
          // Move to next row position
          currentY += chartHeight + titleHeight + chartSpacing;
        }
      } else {
        console.warn(`Chart ref not available for ${title}`);
        // Add a placeholder for missing chart ref
        doc.setFillColor(250, 250, 250);
        doc.rect(chartX, currentY, chartWidth, chartHeight, 'F');
        doc.setTextColor(150, 150, 150);
        doc.text('Chart Not Ready', pageWidth / 2, currentY + chartHeight / 2, { align: "center" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text(title, pageWidth / 2, currentY + chartHeight + 15, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        
        // Move to next row position
        currentY += chartHeight + titleHeight + chartSpacing;
      }
    }
    
   // Add a new page for the table
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
      // Generate email attachments
      const attachments = await generateEmailAttachments(['pdf', 'excel']);
      
      await axios.post(`${API_URL}/api/email_me`, {
        to: email,
        message: "Please find attached dashboard with PDF and Excel reports",
        image: attachments.image,
        pdf: attachments.pdf,
        excel: attachments.excel,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      alert("Dashboard emailed with PDF and Excel attachments!");
      setShowEmailForm(false);
      setEmail("");
    } catch (e) {
      console.error("Failed to send email:", e);
      alert("Failed to send email");
    }
  };


  const handleSubscribeSubmit = async () => {
    if (!reportFormat) {
      alert("Please select a report format.");
      return;
    }
    
    try {
      const payload = {
        repeatFrequency,
        scheduledTime,
        reportFormat, // User's choice: 'pdf', 'excel', or 'both'
        email: loginName || "",  // use logged-in user email if available
      };
      await axios.post(`${API_URL}/api/schedule_report`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      let formatMessage = "";
      switch(reportFormat) {
        case "pdf":
          formatMessage = "PDF reports";
          break;
        case "excel":
          formatMessage = "Excel reports";
          break;
        case "both":
          formatMessage = "both PDF and Excel reports";
          break;
      }
      
      alert(`Subscription scheduled successfully! You will receive ${formatMessage}.`);
      setShowSubscribeForm(false);
    } catch (error) {
      alert("Failed to schedule subscription.");
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
                    id="bubbleChart"
                    label="Cumulative Profit by Product"
                    checked={selectedCharts.bubbleChart}
                    onChange={() => handleChartSelection('bubbleChart')}
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
          <Col lg={8} md={10} sm={12} className="mb-4">
            <Card>
              <Card.Body className="chart-container p-0" style={{ height: "500px" }}>
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

      {selectedCharts.bubbleChart && (
        <Row>
          <Col lg={10} md={12} sm={12} className="mb-4"> {/* Increased from lg={8} to lg={10} for more width */}
            <Card>
              <Card.Body className="chart-container p-0" style={{ height: "500px" }}> {/* Increased from 400px to 500px */}
                <div ref={bubbleRef} style={{ width: "99%", height: "99%" }}></div>
              </Card.Body>
              <Card.Footer className="text-center small">Cumulative Profit by Product</Card.Footer>
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
                {filteredData.slice(0, visibleRows).map((row, idx) => (
                  <tr key={idx}>
                    <td>{row.date}</td>
                    <td>{row.product_name}</td>
                    <td>{row.category}</td>
                    <td>{row.store_name}</td>
                    <td>{row.customer_name}</td>
                    <td>{row.units_sold}</td>
                    <td>{row.revenue}</td>
                    <td>{Number(row.profit).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {filteredData.length > visibleRows && (
              <div className="text-center mt-3">
                <Button 
                  variant="outline-primary" 
                  onClick={() => setVisibleRows(prev => prev + 100)}
                >
                  Show More Rows ({visibleRows} of {filteredData.length} shown)
                </Button>
              </div>
            )}
            {visibleRows > 100 && (
              <div className="text-center mt-2">
                <Button 
                  variant="outline-secondary" 
                  size="sm"
                  onClick={() => setVisibleRows(100)}
                >
                  Show Less
                </Button>
              </div>
            )}
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
  // Validate data before rendering
  if (!data || data.length === 0) {
    d3.select(container).selectAll("*").remove();
    d3.select(container)
      .append("div")
      .style("text-align", "center")
      .style("padding", "20px")
      .style("color", "#666")
      .text("No data available for histogram");
    return;
  }
  
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

function drawTreemap(container, data) {
  // Validate data before rendering
  if (!data || data.length === 0) {
    d3.select(container).selectAll("*").remove();
    d3.select(container)
      .append("div")
      .style("text-align", "center")
      .style("padding", "20px")
      .style("color", "#666")
      .text("No data available for treemap");
    return;
  }
  
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

function drawBubbleChart(container, { data, labelKey = "id" }) {
  // Validate data before rendering
  if (!data || data.length === 0) {
    d3.select(container).selectAll("*").remove();
    d3.select(container)
      .append("div")
      .style("text-align", "center")
      .style("padding", "20px")
      .style("color", "#666")
      .text("No data available for bubble chart");
    return;
  }
  
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

  // Process data - handle both formats
  let processedData;
  if (Array.isArray(data) && data.length > 0) {
    if (data[0].hasOwnProperty('id') && data[0].hasOwnProperty('name') && !data[0].hasOwnProperty('product_name')) {
      // Format from Pizzeria Dashboard component: { id, name, revenue, profit, units_sold }
      // Group by name (treat name as product_name) and calculate cumulative values
      const grouped = d3.group(data, d => d.name);
      processedData = Array.from(grouped, ([productName, items]) => {
        const cumulativeProfit = d3.sum(items, d => Number(d.profit) || 0);
        const cumulativeRevenue = d3.sum(items, d => Number(d.revenue) || 0);
        
        return {
          name: productName || "Unknown Product",
          value: Math.max(cumulativeProfit, 1), // Bubble size corresponds to cumulative profit
          revenue: cumulativeRevenue,
          profit: cumulativeProfit
        };
      });
    } else {
      // Format from PPDashboard component: raw transaction data with product_name
      // Group by product_name and calculate cumulative values
      const grouped = d3.group(data, d => d.product_name);
      processedData = Array.from(grouped, ([productName, transactions]) => {
        const cumulativeProfit = d3.sum(transactions, d => Number(d.profit) || 0);
        const cumulativeRevenue = d3.sum(transactions, d => Number(d.revenue) || 0);
        
        return {
          name: productName || "Unknown Product",
          value: Math.max(cumulativeProfit, 1), // Bubble size corresponds to cumulative profit
          revenue: cumulativeRevenue,
          profit: cumulativeProfit
        };
      });
    }
  } else {
    processedData = [];
  }

  if (processedData.length === 0) {
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .style("fill", "#666")
      .text("No data available");
    return;
  }

  // Create bubble pack layout
  const pack = d3.pack()
    .size([width - 20, height - 20])
    .padding(3);

  const root = d3.hierarchy({ children: processedData })
    .sum(d => d.value);

  const nodes = pack(root).leaves();

  const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

  // Create container group with offset for padding
  const g = svg.append("g")
    .attr("transform", "translate(10, 10)");

  // Create bubbles
  const bubbles = g.selectAll(".bubble")
    .data(nodes)
    .enter()
    .append("g")
    .attr("class", "bubble")
    .attr("transform", d => `translate(${d.x}, ${d.y})`);

  bubbles.append("circle")
    .attr("r", d => d.r)
    .style("fill", d => colorScale(d.data.name))
    .style("opacity", 0.8)
    .style("stroke", "#fff")
    .style("stroke-width", 2);

  // Add labels inside bubbles
  bubbles.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "-0.2em")
    .style("font-size", d => Math.min(d.r / 3, 12) + "px")
    .style("font-weight", "bold")
    .style("fill", "#333")
    .style("pointer-events", "none")
    .text(d => {
      const name = d.data.name || "";
      const maxLength = Math.floor(d.r / 4);
      return name.length > maxLength ? name.substring(0, maxLength) + "..." : name;
    });

  // Add profit value inside bubbles
  bubbles.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "1em")
    .style("font-size", d => Math.min(d.r / 4, 10) + "px")
    .style("fill", "#666")
    .style("pointer-events", "none")
    .text(d => "$" + d3.format(".2s")(d.data.profit));

  // Add title
  // svg.append("text")
  //   .attr("x", width / 2)
  //   .attr("y", 20)
  //   .attr("text-anchor", "middle")
  //   .style("font-size", "14px")
  //   .style("font-weight", "bold")
  //   .style("fill", "#333")
  //   .text("Profit by Product (Bubble Size = Profit)");

  // Add tooltip functionality
  const tooltip = d3.select("body")
    .append("div")
    .style("position", "absolute")
    .style("background", "rgba(0, 0, 0, 0.8)")
    .style("color", "white")
    .style("padding", "8px")
    .style("border-radius", "4px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("opacity", 0);

  bubbles.on("mouseover", function(event, d) {
    tooltip.transition().duration(200).style("opacity", 0.9);
    tooltip.html(`
      <strong>${d.data.name}</strong><br/>
      Revenue: $${d3.format(",.0f")(d.data.revenue)}<br/>
      Profit: $${d3.format(",.0f")(d.data.profit)}<br/>
      Bubble Size: ${d3.format(",.0f")(d.data.value)}
    `)
    .style("left", (event.pageX + 10) + "px")
    .style("top", (event.pageY - 28) + "px");
  })
  .on("mouseout", function() {
    tooltip.transition().duration(500).style("opacity", 0);
  });

  // Clean up tooltip on container destroy
  container.__tooltip = tooltip;
}
