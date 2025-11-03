// ===== Global Error Handler =====
window.addEventListener('error', (event) => {
  logError('Uncaught Error', event.error || event);
});

window.addEventListener('unhandledrejection', (event) => {
  logError('Unhandled Promise Rejection', { reason: event.reason });
});

// ===== State =====
let projectChart = null;
let taskChart = null;
let currentRecords = [];
let currentGroup = 'all';
let currentUser = 'all';
let currentProject = 'all';
let chartType = 'bar';
let startDate = null;
let endDate = null;
let groupTasks = false;

// ===== Constants =====
const meetingTasks = ['Internal Meetings', '1:1 Meetings & Prep', 'Staff Meeting / Town Hall'];

const taskCategories = {
  'Meetings': ['Internal Meetings', '1:1 Meetings & Prep', 'Staff Meeting / Town Hall'],
  'Administration': ['Admin', 'Miscellaneous'],
  'Development': ['Professional Development', 'R&D'],
  'Time Off': ['PTO', 'Holiday'],
  'Travel': ['Internal Travel'],
  'Sales': ['Sales Support']
};

// ===== Enhanced Debug System =====
function log(message, data) {
  try {
    const out = document.getElementById('debugOutput');
    if (!out) {
      console.log('[DEBUG]', message, data);
      return;
    }
    const ts = new Date().toLocaleTimeString();
    let line = `[${ts}] ${message}`;
    if (data !== undefined) {
      try {
        line += '\n' + JSON.stringify(data, null, 2);
      } catch (e) {
        line += '\n[Error stringifying data: ' + e.message + ']';
      }
    }
    out.value = line + '\n' + '='.repeat(80) + '\n' + out.value;
    console.log('[DEBUG]', message, data);
  } catch (e) {
    console.error('Logging failed:', e);
  }
}

function logError(context, error) {
  const errorInfo = {
    message: error.message || String(error),
    stack: error.stack,
    context: context
  };
  log('❌ ERROR in ' + context, errorInfo);
  console.error('ERROR in ' + context, error);
}

// ===== Utility Functions =====
function getTaskCategory(task) {
  if (!groupTasks) return task;

  for (const [category, tasks] of Object.entries(taskCategories)) {
    if (tasks.includes(task)) return category;
  }
  return task;
}

function filterByDateRange(records) {
  if (!startDate && !endDate) return records;

  return records.filter(r => {
    const recordDate = new Date(r.Start_Date);
    const afterStart = !startDate || recordDate >= new Date(startDate);
    const beforeEnd = !endDate || recordDate <= new Date(endDate);
    return afterStart && beforeEnd;
  });
}


// ===== Filter Management =====
function updateFilters(records) {
  try {
    const groups = [...new Set(records.map(r => r.Group))].sort();
    const users = [...new Set(records.map(r => r.User))].sort();
    const projects = [...new Set(records.map(r => r.Project))].sort();

    const groupFilter = document.getElementById('groupFilter');
    const userFilter = document.getElementById('userFilter');
    const projectFilter = document.getElementById('projectFilter');

    groupFilter.innerHTML = '<option value="all">All Groups</option>';
    userFilter.innerHTML = '<option value="all">All Users</option>';
    projectFilter.innerHTML = '<option value="all">All Projects</option>';

    groups.forEach(group => groupFilter.add(new Option(group, group)));
    users.forEach(user => userFilter.add(new Option(user, user)));
    projects.forEach(project => projectFilter.add(new Option(project, project)));

    log('✅ Filters updated', { groups: groups.length, users: users.length, projects: projects.length });
  } catch (err) {
    logError('Filter update failed', err);
  }
}

function initializeDateRange(records) {
  const dates = records.map(r => r.Start_Date).filter(Boolean).sort();
  if (dates.length) {
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];

    const startInput = document.getElementById('startDate');
    const endInput = document.getElementById('endDate');

    startInput.min = firstDate;
    startInput.max = lastDate;
    endInput.min = firstDate;
    endInput.max = lastDate;

    // Set initial range to last month
    const endInitial = new Date(lastDate);
    const startInitial = new Date(endInitial);
    startInitial.setMonth(startInitial.getMonth() - 1);

    startDate = startInitial.toISOString().split('T')[0];
    endDate = lastDate;

    startInput.value = startDate;
    endInput.value = endDate;

    log('📅 Date range initialized', { start: startDate, end: endDate });
  }
}

// ===== Chart Creation =====
function createCharts(records) {
  try {
    // Apply filters
    records = filterByDateRange(records);

    const filtered = records.filter(r => {
      const billableMatch = r.Billable === 'No';
      const groupMatch = currentGroup === 'all' || r.Group === currentGroup;
      const userMatch = currentUser === 'all' || r.User === currentUser;
      const projectMatch = currentProject === 'all' || r.Project === currentProject;
      return billableMatch && groupMatch && userMatch && projectMatch;
    });

    // Calculate hours
    const projectHours = {};
    const taskHours = {};
    const dailyUserHours = {}; // Track hours per day per user

    filtered.forEach(r => {
      const project = r.Project || 'Unknown';
      const task = getTaskCategory(r.Task) || 'Unknown';
      const date = r.Start_Date || 'Unknown';
      const user = r.User || 'Unknown';
      const duration = r.Duration_decimal_ || 0;

      projectHours[project] = (projectHours[project] || 0) + duration;

      // Track daily hours per user for proper average calculation
      if (!dailyUserHours[date]) dailyUserHours[date] = {};
      dailyUserHours[date][user] = (dailyUserHours[date][user] || 0) + duration;

      if (currentProject === 'all' || project === currentProject) {
        taskHours[task] = (taskHours[task] || 0) + duration;
      }
    });

    // Calculate PTO/Holiday/Meeting hours from filtered records
    let ptoHours = 0;
    let holidayHours = 0;
    let meetingHours = 0;

    // Debug: collect all unique task names
    const uniqueTasks = new Set();

    filtered.forEach(r => {
      const task = r.Task || '';
      uniqueTasks.add(task);

      // Check for PTO (case insensitive and partial match)
      if (task.toLowerCase().includes('pto') || task.toLowerCase().includes('paid time off')) {
        ptoHours += r.Duration_decimal_ || 0;
      }

      // Check for Holiday (case insensitive and partial match)
      if (task.toLowerCase().includes('holiday')) {
        holidayHours += r.Duration_decimal_ || 0;
      }

      // Meeting hours (exact match from array)
      if (meetingTasks.includes(task)) {
        meetingHours += r.Duration_decimal_ || 0;
      }
    });

    const projectData = Object.entries(projectHours).sort((a, b) => b[1] - a[1]);
    const taskData = Object.entries(taskHours).sort((a, b) => b[1] - a[1]);

    const total = Object.values(projectHours).reduce((a, b) => a + b, 0);

    // Calculate proper average: total user-days with hours
    let totalUserDays = 0;
    Object.values(dailyUserHours).forEach(dayData => {
      totalUserDays += Object.keys(dayData).length; // Count users who worked each day
    });

    const avgPerDay = totalUserDays ? (total / totalUserDays) : 0;
    const topProject = projectData[0] || ['None', 0];

    // Update statistics
    document.getElementById('totalHours').textContent = total.toFixed(1);
    document.getElementById('avgHoursPerDay').textContent = avgPerDay.toFixed(1);
    document.getElementById('topProject').textContent = `${topProject[0]} (${topProject[1].toFixed(1)}h)`;
    document.getElementById('ptoHours').textContent = ptoHours.toFixed(1);
    document.getElementById('holidayHours').textContent = holidayHours.toFixed(1);
    document.getElementById('meetingHours').textContent = meetingHours.toFixed(1);

    // Create project chart
    const projectCtx = document.getElementById('projectChart').getContext('2d');
    if (projectChart) projectChart.destroy();

    projectChart = new Chart(projectCtx, {
      type: chartType === 'bar' ? 'bar' : 'doughnut',
      data: {
        labels: projectData.map(([project]) => project),
        datasets: [{
          data: projectData.map(([, hours]) => hours),
          backgroundColor: chartType === 'bar' ? '#4CAF50' : [
            '#4CAF50', '#2196F3', '#FFC107', '#FF5722', '#9C27B0',
            '#795548', '#607D8B', '#E91E63', '#9E9E9E', '#CDDC39'
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: chartType === 'bar' ? 'y' : 'x',
        plugins: {
          title: {
            display: true,
            text: 'Non-Billable Hours by Project'
          },
          legend: {
            display: chartType === 'doughnut',
            position: chartType === 'doughnut' ? 'right' : 'top'
          }
        },
        scales: chartType === 'bar' ? {
          x: {
            title: {
              display: true,
              text: 'Hours'
            }
          }
        } : undefined
      }
    });

    // Create task chart
    const taskCtx = document.getElementById('taskChart').getContext('2d');
    if (taskChart) taskChart.destroy();

    taskChart = new Chart(taskCtx, {
      type: 'bar',
      data: {
        labels: taskData.map(([task]) => task),
        datasets: [{
          data: taskData.map(([, hours]) => hours),
          backgroundColor: '#2196F3'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: currentProject === 'all' ?
              'Task Breakdown (All Projects)' :
              `Task Breakdown: ${currentProject}`
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return `${context.formattedValue} hours (click for details)`;
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Hours'
            }
          }
        },
        onClick: function(e, elements) {
          if (elements.length > 0) {
            const index = elements[0].index;
            const task = taskData[index][0];
            showTaskDetails(task);
          }
        }
      }
    });

    log('📊 Charts updated', {
      dateRange: { start: startDate, end: endDate },
      filteredRecords: filtered.length,
      groupedTasks: groupTasks,
      totalHours: total,
      ptoHours,
      holidayHours,
      meetingHours,
      uniqueTasks: Array.from(uniqueTasks).length
    });
  } catch (err) {
    logError('Chart creation', err);
  }
}

// ===== Task Detail Management =====
let currentDetailRecords = [];
let currentSortColumn = 'duration';
let currentSortDirection = 'desc';

function sortDetailRecords() {
  return [...currentDetailRecords].sort((a, b) => {
    let valueA, valueB;

    if (currentSortColumn === 'date') {
      valueA = new Date(a.Start_Date || 0);
      valueB = new Date(b.Start_Date || 0);
    } else if (currentSortColumn === 'user') {
      valueA = a.User || '';
      valueB = b.User || '';
      return currentSortDirection === 'asc'
        ? valueA.localeCompare(valueB)
        : valueB.localeCompare(valueA);
    } else if (currentSortColumn === 'duration') {
      valueA = a.Duration_decimal_ || 0;
      valueB = b.Duration_decimal_ || 0;
    }

    if (currentSortDirection === 'asc') {
      return valueA - valueB;
    } else {
      return valueB - valueA;
    }
  });
}

function renderDetailTable() {
  const detailTableBody = document.getElementById('detailTableBody');
  detailTableBody.innerHTML = '';

  const sortedRecords = sortDetailRecords();

  sortedRecords.forEach(record => {
    const row = document.createElement('tr');

    // Format date
    const date = record.Start_Date ? new Date(record.Start_Date).toLocaleDateString() : 'N/A';

    // Add cells
    row.innerHTML = `
      <td>${date}</td>
      <td>${record.User || 'N/A'}</td>
      <td>${(record.Duration_decimal_ || 0).toFixed(1)}h</td>
      <td>${record.Description || 'N/A'}</td>
    `;

    detailTableBody.appendChild(row);
  });

  // Update sort indicators on headers
  const headers = document.querySelectorAll('.detail-table th[data-sort]');
  headers.forEach(header => {
    const sortCol = header.getAttribute('data-sort');
    header.classList.remove('sort-asc', 'sort-desc');

    if (sortCol === currentSortColumn) {
      header.classList.add(currentSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

function initializeTableSorting() {
  const headers = document.querySelectorAll('.detail-table th[data-sort]');

  headers.forEach(header => {
    header.addEventListener('click', () => {
      const sortCol = header.getAttribute('data-sort');

      // If clicking the same column, toggle direction
      if (sortCol === currentSortColumn) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        // New column, set as default direction (desc)
        currentSortColumn = sortCol;
        currentSortDirection = 'desc';
      }

      renderDetailTable();
      log('🔄 Table sorted', { column: currentSortColumn, direction: currentSortDirection });
    });
  });
}

function showTaskDetails(task) {
  const detailPanel = document.getElementById('detailPanel');
  const detailTitle = document.getElementById('detailTitle');

  // Filter records for the selected task
  currentDetailRecords = currentRecords.filter(r => {
    const isTask = groupTasks ? getTaskCategory(r.Task) === task : r.Task === task;
    const groupMatch = currentGroup === 'all' || r.Group === currentGroup;
    const userMatch = currentUser === 'all' || r.User === currentUser;
    const projectMatch = currentProject === 'all' || r.Project === currentProject;
    const billableMatch = r.Billable === 'No';
    const dateMatch = filterByDateRange([r]).length > 0;

    return isTask && groupMatch && userMatch && projectMatch && billableMatch && dateMatch;
  });

  // Calculate total hours
  const totalHours = currentDetailRecords.reduce((sum, record) => sum + (record.Duration_decimal_ || 0), 0);

  // Update title with total hours
  detailTitle.textContent = `Task Details: ${task} (${totalHours.toFixed(2)} hours)`;

  // Default sort by duration descending
  currentSortColumn = 'duration';
  currentSortDirection = 'desc';

  // Render the sorted table
  renderDetailTable();

  // Show the panel
  detailPanel.style.display = 'block';

  // Scroll to detail panel
  detailPanel.scrollIntoView({ behavior: 'smooth' });

  log('📋 Showing task details', {
    task,
    records: currentDetailRecords.length,
    totalHours: totalHours.toFixed(2)
  });
}

// ===== Event Listeners Setup =====
function setupEventListeners() {
  // Filter dropdowns
  document.getElementById('groupFilter').addEventListener('change', (e) => {
    currentGroup = e.target.value;
    log('🔄 Group filter changed', { group: currentGroup });
    createCharts(currentRecords);
  });

  document.getElementById('userFilter').addEventListener('change', (e) => {
    currentUser = e.target.value;
    log('🔄 User filter changed', { user: currentUser });
    createCharts(currentRecords);
  });

  document.getElementById('projectFilter').addEventListener('change', (e) => {
    currentProject = e.target.value;
    log('🔄 Project filter changed', { project: currentProject });
    createCharts(currentRecords);
  });

  // Date range
  document.getElementById('startDate').addEventListener('change', (e) => {
    startDate = e.target.value;
    log('📅 Start date changed', { date: startDate });
    createCharts(currentRecords);
  });

  document.getElementById('endDate').addEventListener('change', (e) => {
    endDate = e.target.value;
    log('📅 End date changed', { date: endDate });
    createCharts(currentRecords);
  });

  // Group tasks checkbox
  document.getElementById('groupTasks').addEventListener('change', (e) => {
    groupTasks = e.target.checked;
    log('🔄 Group tasks changed', { grouped: groupTasks });
    createCharts(currentRecords);
  });

  // Chart type buttons
  document.getElementById('barChart').addEventListener('click', (e) => {
    chartType = 'bar';
    document.getElementById('barChart').classList.add('active');
    document.getElementById('donutChart').classList.remove('active');
    log('📊 Chart type changed', { type: 'bar' });
    createCharts(currentRecords);
  });

  document.getElementById('donutChart').addEventListener('click', (e) => {
    chartType = 'doughnut';
    document.getElementById('donutChart').classList.add('active');
    document.getElementById('barChart').classList.remove('active');
    log('📊 Chart type changed', { type: 'doughnut' });
    createCharts(currentRecords);
  });

  log('✅ Event listeners initialized');
}

// ===== Debug Panel Handlers =====
function setupDebugPanel() {
  const toggleBtn = document.getElementById('toggleDebug');
  const debugPanel = document.getElementById('debugPanel');
  const closeDebugBtn = document.getElementById('closeDebug');

  if (toggleBtn && debugPanel) {
    toggleBtn.addEventListener('click', () => {
      if (debugPanel.classList.contains('debug-panel-visible')) {
        debugPanel.classList.remove('debug-panel-visible');
        debugPanel.classList.add('debug-panel-hidden');
      } else {
        debugPanel.classList.remove('debug-panel-hidden');
        debugPanel.classList.add('debug-panel-visible');
      }
      log('👀 Debug panel toggled');
    });
  }

  if (closeDebugBtn && debugPanel) {
    closeDebugBtn.addEventListener('click', () => {
      debugPanel.classList.remove('debug-panel-visible');
      debugPanel.classList.add('debug-panel-hidden');
      log('📦 Debug panel closed');
    });
  }

  // Clear debug log
  const clearBtn = document.getElementById('clearDebug');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const out = document.getElementById('debugOutput');
      if (out) out.value = '';
      log('🧹 Debug log cleared');
    });
  }

  // Dump records
  const dumpRecordsBtn = document.getElementById('dumpRecords');
  if (dumpRecordsBtn) {
    dumpRecordsBtn.addEventListener('click', () => {
      log('📊 Current Records (first 10)', currentRecords.slice(0, 10));
      log('📊 Total Records Count', currentRecords.length);
    });
  }

  // Dump filters
  const dumpFiltersBtn = document.getElementById('dumpFilters');
  if (dumpFiltersBtn) {
    dumpFiltersBtn.addEventListener('click', () => {
      log('🔍 Current Filters', {
        group: currentGroup,
        user: currentUser,
        project: currentProject,
        startDate,
        endDate
      });
    });
  }

  // Dump state
  const dumpStateBtn = document.getElementById('dumpState');
  if (dumpStateBtn) {
    dumpStateBtn.addEventListener('click', () => {
      log('📍 Current State', {
        chartType,
        groupTasks,
        recordsCount: currentRecords.length,
        detailRecordsCount: currentDetailRecords.length
      });
    });
  }
}

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
  log('🚀 Script loaded, DOM ready');
  initializeTableSorting();
  setupDebugPanel();
});

// Initialize Grist
grist.ready({
  requiredHeight: 800
});

// Handle incoming data from Grist
grist.onRecords(records => {
  log('📦 Received records from Grist', { count: records.length });
  currentRecords = records;
  initializeDateRange(records);
  updateFilters(records);
  setupEventListeners();
  createCharts(records);
});
