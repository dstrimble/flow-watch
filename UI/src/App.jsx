import { useEffect, useState } from "react";
import 'bootstrap/dist/css/bootstrap.min.css';
import FlowWatchHeader from "./FlowWatchHeader";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend
} from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";
import { FaStar, FaRegStar } from "react-icons/fa";

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Title, Tooltip, Legend, annotationPlugin);

const API_HOST = (window._env_ && window._env_.REACT_APP_API_HOST) || process.env.REACT_APP_API_HOST || "http://localhost:3000";

function DamCards({ damCodes }) {
  const [currentFlow, setCurrentFlow] = useState({});
  const [favorites, setFavorites] = useState([]);

  // Load favorites from localStorage on mount
  useEffect(() => {
    const savedFavorites = localStorage.getItem('flowwatch_favorites');
    if (savedFavorites) {
      try {
        setFavorites(JSON.parse(savedFavorites));
      } catch (err) {
        console.error('Failed to parse favorites from localStorage:', err);
      }
    }
  }, []);

  useEffect(() => {
    fetch(`${API_HOST}/schedule/currentflow`)
      .then(res => res.json())
      .then(data => setCurrentFlow(data));
  }, []);

  function toggleFavorite(code) {
    setFavorites(prevFavorites => {
      let newFavorites;
      if (prevFavorites.includes(code)) {
        newFavorites = prevFavorites.filter(fav => fav !== code);
      } else {
        newFavorites = [...prevFavorites, code];
      }
      // Save to localStorage, but do not let storage failures break the UI
      try {
        localStorage.setItem('flowwatch_favorites', JSON.stringify(newFavorites));
      } catch (err) {
        console.warn('Failed to persist favorites to localStorage; using in-memory favorites only.', err);
      }
      return newFavorites;
    });
  }

  // Sort dams: favorites first, then alphabetically
  const sortedDams = [...damCodes].sort((a, b) => {
    const aFav = favorites.includes(a.code);
    const bFav = favorites.includes(b.code);
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;
    return a.code.localeCompare(b.code);
  });

  return (
    <div className="container mt-4">
      <h2 className="mb-4 text-center">Select a Dam</h2>
      <div className="row justify-content-center">
        {sortedDams.map(dam => (
          <div key={dam.code} className="col-12 col-sm-6 col-md-4 col-lg-3 mb-4">
            <div className="card h-100 shadow-sm">
              <div className="card-body d-flex flex-column justify-content-between">
                <div className="d-flex justify-content-between align-items-center">
                  <h5 className="card-title text-primary mb-0">{dam.code}</h5>
                  <span
                    role="button"
                    tabIndex={0}
                    style={{ cursor: 'pointer', fontSize: '1.5em' }}
                    onClick={() => toggleFavorite(dam.code)}
                    onKeyPress={e => { if (e.key === 'Enter') toggleFavorite(dam.code); }}
                    aria-label={favorites.includes(dam.code) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {favorites.includes(dam.code) ? <FaStar color="#ffc107" /> : <FaRegStar color="#ccc" />}
                  </span>
                </div>
                <p className="card-text mb-1"><strong>Project:</strong> {dam.project}</p>
                {/* Only show state and current flow if not ALL */}
                {dam.code !== 'ALL' && (
                  <>
                    <p className="card-text mb-1"><strong>State:</strong> {dam.state}</p>
                    <p className="card-text mb-1">
                      <strong>Current Flow:</strong> {currentFlow[dam.code] !== undefined ? `${currentFlow[dam.code]} MW` : <span className="text-muted">N/A</span>}
                    </p>
                    <p className="card-text mb-1"><strong>Headwater Level:</strong>{' '}{dam.headwater_level !== null ? `${dam.headwater_level} ft` : <span className="text-muted">N/A</span>}
                    </p>
                    <p className="card-text mb-1"><strong>Tailwater Level:</strong>{' '}{dam.tailwater_level !== null ? `${dam.tailwater_level} ft` : <span className="text-muted">N/A</span>}
                    </p>
                  </>
                )}
                <a href={`/${dam.code}`} className="btn btn-outline-primary mt-auto">View Schedule</a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatHour(hour) {
  const h = Number(hour);
  return `${h.toString().padStart(2, "0")}:00`;
}

function formatTimestamp(ts) {
  if (!ts) return "Unavailable";

  const date = new Date(ts);

  const local = date.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short"
  });

  const zone = date.toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    timeZoneName: "short"
  }).split(" ").pop();

  return `${local} ${zone}`;
}

function getColorForDam(code, damCodesFull) {
  const dam = damCodesFull.find(d => d.code === code);
  return dam && dam.color ? dam.color : '#007bff';
}

function ScheduleTable({ damCode }) {
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [date, setDate] = useState("");
  const [projectName, setProjectName] = useState("");
  const [damCodesFull, setDamCodesFull] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  useEffect(() => {
    fetch(`${API_HOST}/schedule/damcodes`)
      .then(res => res.json())
      .then(data => setDamCodesFull(data));
  }, []);

  useEffect(() => {
    if (!damCode || !selectedDate) return;
    fetch(`${API_HOST}/schedule/${damCode}/${selectedDate}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch schedule");
        return res.json();
      })
      .then((data) => {
        setSchedule(data);
        if (data.length > 0 && data[0].date) setDate(data[0].date);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [damCode, selectedDate]);

  useEffect(() => {
    fetch(`${API_HOST}/schedule/damcodes`)
      .then(res => res.json())
      .then(data => {
        const dam = data.find(d => d.code === damCode);
        setProjectName(dam ? dam.project : damCode);
      });
  }, [damCode]);

  if (loading) return <div className="text-center mt-5">Loading...</div>;
  if (error) return <div className="alert alert-danger mt-5">{error}</div>;

  // Get all dam codes from the first row
  const damCodes = schedule.length > 0 ? Object.keys(schedule[0]).filter(
    (key) => key !== "hour" && key !== "date" && key !== "_id" && key !== "HR"
  ) : [];

  // Date navigation handlers
  function changeDay(offset) {
    const [year, month, day] = selectedDate.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    dateObj.setDate(dateObj.getDate() + offset);
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    setSelectedDate(`${yyyy}-${mm}-${dd}`);
  }

  let chartData, chartOptions;
  if (damCode === "ALL") {
    // Multi-line chart for ALL dams
    // Calculate current time index for green line
    const now = new Date();
    const currentHour = now.getHours();
    const currentTimeLabel = formatHour(currentHour);
    const currentIndex = schedule.map(row => formatHour(row.hour)).indexOf(currentTimeLabel);
    const todayStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
    const showCurrentLine = date === todayStr;

    chartData = {
      labels: schedule.map(row => formatHour(row.hour)),
      datasets: damCodes.map((code) => ({
        label: (damCodesFull.find(d => d.code === code)?.project || code), // Remove (MW) from legend label
        data: schedule.map(row => Number(row[code])),
        fill: false,
        borderColor: getColorForDam(code, damCodesFull),
        backgroundColor: getColorForDam(code, damCodesFull),
        tension: 0.2,
        pointRadius: 2
      }))
    };
    chartOptions = {
      responsive: true,
      plugins: {
        legend: { display: true, position: 'bottom' },
        title: {
          display: true,
          text: `Release Schedule for All Dams (${date})`
        },
        annotation: {
          annotations: showCurrentLine && currentIndex !== -1 ? {
            currentTimeLine: {
              type: 'line',
              scaleID: 'x',
              value: currentTimeLabel,
              borderColor: 'green',
              borderWidth: 2,
              label: {
                display: true,
                content: 'Now',
                position: 'start',
                color: 'green',
                font: { weight: 'bold' }
              }
            }
          } : {}
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.parsed.y} MW`;
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: "Time" } },
        y: { title: { display: true, text: "Output (MW)" } }
      }
    };
  } else {
    // Prepare chart data for the first dam code (since only one damCode is shown)
    const dam = damCodes[0];
    const times = schedule.map(row => formatHour(row.hour));
    const outputs = schedule.map(row => Number(row[dam]));
    // Calculate current time index for green line
    const now = new Date();
    const currentHour = now.getHours();
    const currentTimeLabel = formatHour(currentHour);
    const currentIndex = times.indexOf(currentTimeLabel);
    // Only show green line if viewing today's date
    const todayStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
    const showCurrentLine = date === todayStr;
    chartData = {
      labels: times,
      datasets: [
        {
          label: `${projectName} Output (MW)`,
          data: outputs,
          fill: false,
          borderColor: "#007bff",
          backgroundColor: "#007bff",
          tension: 0.2,
          pointRadius: 3
        }
      ]
    };
    chartOptions = {
      responsive: true,
      plugins: {
        legend: { display: true },
        title: {
          display: true,
          text: `Release Schedule for ${projectName} (${date})`
        },
        annotation: {
          annotations: showCurrentLine && currentIndex !== -1 ? {
            currentTimeLine: {
              type: 'line',
              scaleID: 'x',
              value: currentTimeLabel,
              borderColor: 'green',
              borderWidth: 2,
              label: {
                display: true,
                content: 'Now',
                position: 'start',
                color: 'green',
                font: { weight: 'bold' }
              }
            }
          } : {}
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.parsed.y} MW`;
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: "Time" } },
        y: { title: { display: true, text: "Output (MW)" } }
      }
    };
  }

  // Show chart title and arrows even if no schedule data
  if (!schedule.length) {
    return (
      <div className="container mt-4">
        <h2 className="mb-2 text-center">Water Release Schedule for {damCode === "ALL" ? "All Dams" : projectName}</h2>
        <div className="mb-4 text-center">
          <button className="btn btn-outline-secondary me-2" onClick={() => changeDay(-1)}>&larr;</button>
          <strong>Date:</strong> {selectedDate}
          <button className="btn btn-outline-secondary ms-2" onClick={() => changeDay(1)}>&rarr;</button>
        </div>
        <div className="alert alert-warning mt-5">No schedule data found.</div>
      </div>
    );
  }

  // Get data for the selected dam code
  const damMeta = damCodesFull.find(d => d.code === damCode);

  return (
    <div className="container mt-4">
      <div className="d-flex flex-column align-items-center text-center mb-3 px-3">
        <h2 className="mb-2">
          Today's Water Release Schedule for {damCode === "ALL" ? "All Dams" : projectName}
        </h2>
        <div>
          <button className="btn btn-outline-secondary me-2" onClick={() => changeDay(-1)}>&larr;</button>
          <strong>Date:</strong> {date}
          <button className="btn btn-outline-secondary ms-2" onClick={() => changeDay(1)}>&rarr;</button>
        </div>
      </div>

      {/* Water Levels*/}
      {damCode !== "ALL" && damMeta && (
        <div
          className="d-flex justify-content-center align-items-center text-muted mb-3 px-3 flex-wrap gap-4"
          style={{ fontSize: "0.75rem" }}
        >
          <div>
            <strong>Headwater Level:</strong> {damMeta.headwater_level ?? "N/A"} ft
            <span
              className="ms-2"
              title={`Last updated: ${formatTimestamp(damMeta.headwater_level_timestamp)}`}
              style={{ cursor: "help" }}
            >
              <i className="bi bi-clock" style={{ fontSize: "0.85rem", color: "#666" }}></i>
            </span>
          </div>
          <div>
            <strong>Tailwater Level:</strong> {damMeta.tailwater_level ?? "N/A"} ft
            <span
              className="ms-2"
              title={`Last updated: ${formatTimestamp(damMeta.tailwater_level_timestamp)}`}
              style={{ cursor: "help" }}
            >
              <i className="bi bi-clock" style={{ fontSize: "0.85rem", color: "#666" }}></i>
            </span>
          </div>
        </div>
      )}

      {/* Chart Block */}
      <div className="mb-4">
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}

function useDamCode() {
  const [damCode, setDamCode] = useState(null);
  useEffect(() => {
    const code = window.location.pathname.replace(/^\//, "");
    setDamCode(code || null);
    const updateDamCode = () => {
      const code = window.location.pathname.replace(/^\//, "");
      setDamCode(code || null);
    };
    updateDamCode();
    window.addEventListener("popstate", updateDamCode);
    return () => {
      window.removeEventListener("popstate", updateDamCode);
    };
  }, []);
  return damCode;
}

function useDamCodesFull() {
  const [damCodes, setDamCodes] = useState([]);
  useEffect(() => {
    fetch(`${API_HOST}/schedule/damcodes`)
      .then(res => res.json())
      .then(data => setDamCodes(data));
  }, []);
  return damCodes;
}

export default function App() {
  const damCode = useDamCode();
  const damCodesFull = useDamCodesFull();

  if (!damCode) {
    return <>
      <FlowWatchHeader />
      <DamCards damCodes={damCodesFull} />
    </>;
  }
  return <>
    <FlowWatchHeader />
    <div className="container text-center mb-2">
      <a href="/" className="btn btn-outline-primary btn-sm mt-2 mb-2">&larr; Home</a>
    </div>
    <ScheduleTable damCode={damCode} />
  </>;
}