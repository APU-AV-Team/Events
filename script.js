const API_URL = 'https://api.solomonricky.eu.org/api/GetEventsWithinDateRange';
const AUTO_REFRESH_MS = 30 * 60 * 1000;
const EVENT_ALERT_CHECK_MS = 15 * 1000;
const RINGTONE_FILE = './boxing-bell.mp3';

const currentDateEl = document.querySelector('#currentDate');
const currentTimeEl = document.querySelector('#currentTime');
const timezoneEl = document.querySelector('#timezone');
const eventsTitleEl = document.querySelector('#eventsTitle');
const statusEl = document.querySelector('#status');
const eventsListEl = document.querySelector('#eventsList');
const soundButtonEl = document.querySelector('#soundButton');

let selectedDate = new Date();
let isFetching = false;
let currentEvents = [];
let soundEnabled = false;
let soundPromptShown = false;
const ringtone = new Audio(RINGTONE_FILE);
ringtone.preload = 'auto';

function toDateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseApiDate(value) {
  if (!value) return null;

  const stringValue = String(value);
  const match = stringValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  const parsed = new Date(stringValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCurrentDateParts(date) {
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date);
  const dateText = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);

  return { weekday, dateText };
}

function formatDayName(date) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date);
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function updateClock() {
  const now = new Date();
  selectedDate = toDateOnly(now);

  const { weekday, dateText } = formatCurrentDateParts(now);
  currentDateEl.innerHTML = `
    <span class="date-line">${escapeHtml(weekday)}</span>
    <span class="date-line">${escapeHtml(dateText)}</span>
  `;
  currentTimeEl.textContent = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(now);

  timezoneEl.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
}

function updateEventsTitle() {
  eventsTitleEl.textContent = 'Event';
}

function showStatus(message, type = 'info') {
  statusEl.textContent = message;
  statusEl.className = `status is-visible ${type === 'error' ? 'is-error' : ''}`;
}

function hideStatus() {
  statusEl.className = 'status';
  statusEl.textContent = '';
}

function normalizeEvents(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.events)) return data.events;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.result)) return data.result;
  return [];
}

function getValue(event, key, fallback = '') {
  const value = event?.[key];
  return value === undefined || value === null ? fallback : value;
}

function normalizeEvent(event, index) {
  const eventDate = parseApiDate(getValue(event, 'eventDate')) || toDateOnly(selectedDate);

  return {
    eventName: String(getValue(event, 'eventName', `Event ${index + 1}`)).trim(),
    eventDate,
    eventStartTime: String(getValue(event, 'eventStartTime', '')).trim(),
    eventEndTime: String(getValue(event, 'eventEndTime', '')).trim(),
    eventLocation: String(getValue(event, 'eventLocation', '')).trim(),
    isDeployed: isTruthyDeployed(getValue(event, 'isDeployed', ''))
  };
}

function isTruthyDeployed(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;

  const normalized = String(value).trim().toLowerCase();
  return normalized !== '' && normalized !== 'false' && normalized !== '0' && normalized !== 'no' && normalized !== 'null';
}

function parseTimeOnDate(date, timeText) {
  if (!date || !timeText) return null;

  const cleanTime = String(timeText).trim().toUpperCase();
  const match = cleanTime.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);

  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3];

  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;

  if (hours > 23 || minutes > 59) return null;

  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}

function hasEventEnded(event, now = new Date()) {
  const eventDay = toDateOnly(event.eventDate);
  const today = toDateOnly(now);

  if (eventDay < today) return true;
  if (eventDay > today) return false;

  const endDateTime = parseTimeOnDate(event.eventDate, event.eventEndTime);
  if (!endDateTime) return false;

  return endDateTime <= now;
}

function getTimeSortValue(time) {
  if (!time) return Number.MAX_SAFE_INTEGER;

  const parsed = parseTimeOnDate(new Date(1970, 0, 1), time);
  return parsed ? parsed.getTime() : Number.MAX_SAFE_INTEGER;
}

function groupEventsByDate(events) {
  return events.reduce((groups, event) => {
    const key = getLocalDateString(event.eventDate);

    if (!groups.has(key)) {
      groups.set(key, {
        date: event.eventDate,
        events: []
      });
    }

    groups.get(key).events.push(event);
    return groups;
  }, new Map());
}


function getEventAlertKey(event) {
  return [
    event.eventName,
    getLocalDateString(event.eventDate),
    event.eventStartTime,
    event.eventEndTime,
    event.eventLocation
  ].join('|');
}

function hasAlreadyAlerted(event) {
  return sessionStorage.getItem(`event-alerted:${getEventAlertKey(event)}`) === '1';
}

function markAlerted(event) {
  sessionStorage.setItem(`event-alerted:${getEventAlertKey(event)}`, '1');
}

function shouldRingForEvent(event, now = new Date()) {
  if (event.isDeployed || hasAlreadyAlerted(event)) return false;

  const eventDay = toDateOnly(event.eventDate);
  const today = toDateOnly(now);
  if (eventDay.getTime() !== today.getTime()) return false;

  const startDateTime = parseTimeOnDate(event.eventDate, event.eventStartTime);
  if (!startDateTime || now < startDateTime) return false;

  const endDateTime = parseTimeOnDate(event.eventDate, event.eventEndTime);
  if (endDateTime && now >= endDateTime) return false;

  return true;
}

async function playRingtone() {
  try {
    ringtone.currentTime = 0;
    await ringtone.play();
    soundEnabled = true;
    soundButtonEl.classList.remove('is-visible');
  } catch (error) {
    soundEnabled = false;
    showSoundButton();
  }
}

function showSoundButton() {
  soundPromptShown = true;
  soundButtonEl.classList.add('is-visible');
}

function checkEventStartAlerts() {
  const now = new Date();
  const eventsToAlert = currentEvents.filter((event) => shouldRingForEvent(event, now));

  eventsToAlert.forEach(markAlerted);

  if (eventsToAlert.length) {
    playRingtone();
  }
}

function renderEvents(rawEvents) {
  eventsListEl.innerHTML = '';

  const now = new Date();
  const events = rawEvents
    .map(normalizeEvent)
    .filter((event) => !hasEventEnded(event, now))
    .sort((a, b) => a.eventDate - b.eventDate || getTimeSortValue(a.eventStartTime) - getTimeSortValue(b.eventStartTime));

  currentEvents = events;

  if (!events.length) {
    eventsListEl.innerHTML = `<div class="empty-state">No upcoming events found for ${escapeHtml(formatShortDate(selectedDate))}.</div>`;
    return;
  }

  const groups = [...groupEventsByDate(events).values()].sort((a, b) => a.date - b.date);
  const fragment = document.createDocumentFragment();

  groups.forEach((group) => {
    group.events.sort((a, b) => getTimeSortValue(a.eventStartTime) - getTimeSortValue(b.eventStartTime));

    const dayGroup = document.createElement('section');
    dayGroup.className = 'day-group';
    dayGroup.innerHTML = `
      <header class="day-heading">
        <h3>${escapeHtml(formatDayName(group.date))}</h3>
        <span>${escapeHtml(formatShortDate(group.date))}</span>
      </header>
    `;

    group.events.forEach((event) => {
      dayGroup.appendChild(createEventCard(event));
    });

    fragment.appendChild(dayGroup);
  });

  eventsListEl.appendChild(fragment);
  checkEventStartAlerts();
}

function createEventCard(event) {
  const timeText = event.eventStartTime && event.eventEndTime
    ? `${event.eventStartTime} - ${event.eventEndTime}`
    : event.eventStartTime || event.eventEndTime || 'Time not specified';

  const card = document.createElement('article');
  card.className = 'event-card';
  card.innerHTML = `
    <div class="event-content">
      <h4>${escapeHtml(event.eventName)}</h4>
      <p class="event-meta">
        <span class="event-pill">${escapeHtml(timeText)}</span>
        <span class="event-pill">${escapeHtml(event.eventLocation || 'Location not specified')}</span>
      </p>
    </div>
    ${event.isDeployed ? '<span class="deployed-check" title="Deployed" aria-label="Deployed">✓</span>' : '<span class="empty-deployed" aria-hidden="true"></span>'}
  `;

  return card;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function fetchEvents({ silent = false } = {}) {
  if (isFetching) return;

  isFetching = true;
  selectedDate = toDateOnly(new Date());
  const requestDate = getLocalDateString(selectedDate);
  updateClock();
  updateEventsTitle();

  if (!silent) {
    showStatus(`Loading events for ${requestDate}...`);
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(requestDate)
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const events = normalizeEvents(data);
    renderEvents(events);
    hideStatus();
  } catch (error) {
    console.error(error);
    eventsListEl.innerHTML = '';
    showStatus(`Unable to load events. ${error.message}`, 'error');
  } finally {
    isFetching = false;
  }
}

soundButtonEl.addEventListener('click', async () => {
  soundEnabled = true;
  soundButtonEl.classList.remove('is-visible');

  try {
    await ringtone.play();
    ringtone.pause();
    ringtone.currentTime = 0;
  } catch (error) {
    showSoundButton();
  }

  checkEventStartAlerts();
});

updateClock();
updateEventsTitle();
setInterval(updateClock, 1000);
setInterval(checkEventStartAlerts, EVENT_ALERT_CHECK_MS);
setInterval(() => fetchEvents({ silent: true }), AUTO_REFRESH_MS);
fetchEvents();
