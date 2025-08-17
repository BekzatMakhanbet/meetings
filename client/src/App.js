import React, { useEffect, useRef, useState } from "react";
import { OpenVidu } from "openvidu-browser";
import axios from "axios";
import io from "socket.io-client";
import "./styles.css";

const SERVER_URL = "http://localhost:5000";

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  
  useEffect(() => {
    if (token && !authChecked) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      verifyToken();
    } else if (!token) {
      setIsLoading(false);
      setAuthChecked(true);
    }
  }, [token, authChecked]);

  const verifyToken = async () => {
    try {
      const response = await axios.get(`${SERVER_URL}/api/me`);
      setUser(response.data);
      setAuthChecked(true);
      setIsLoading(false);
    } catch (err) {
      console.error('Token verification failed:', err);
      logout();
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setAuthChecked(true);
    setIsLoading(false);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div>Загрузка...</div>
      </div>
    );
  }

  if (!token || !user) {
    return <AuthScreen setToken={setToken} setUser={setUser} setAuthChecked={setAuthChecked} />;
  }

  return (
    <div className="app">
      <div className="app-header">
        <h1>Teams Clone</h1>
        <div>
          <span>Привет, {user.username}!</span>
          <button className="btn secondary" onClick={logout} style={{marginLeft: 10}}>
            Выйти
          </button>
        </div>
      </div>
      <MeetingApp token={token} user={user} onAuthError={logout} />
    </div>
  );
}

function AuthScreen({ setToken, setUser, setAuthChecked }) {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const endpoint = isLogin ? '/api/login' : '/api/register';
      const payload = isLogin 
        ? { email: formData.email, password: formData.password }
        : formData;

      const response = await axios.post(`${SERVER_URL}${endpoint}`, payload);
      const { token, user } = response.data;
      
      localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setToken(token);
      setUser(user);
      setAuthChecked(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сервера');
    }
    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-form">
        <h2>{isLogin ? 'Вход' : 'Регистрация'}</h2>
        {error && <div className="error">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <input
              type="text"
              placeholder="Имя пользователя"
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
              required
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            required
          />
          <input
            type="password"
            placeholder="Пароль"
            value={formData.password}
            onChange={(e) => setFormData({...formData, password: e.target.value})}
            required
          />
          <button type="submit" className="btn" disabled={loading}>
            {loading ? 'Загрузка...' : (isLogin ? 'Войти' : 'Зарегистрироваться')}
          </button>
        </form>
        
        <p>
          {isLogin ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}
          <button 
            className="link-btn" 
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </p>
      </div>
    </div>
  );
}

function MeetingApp({ token, user, onAuthError }) {
  const [currentView, setCurrentView] = useState('rooms'); // 'rooms' or 'meeting'
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentView === 'rooms') {
      loadRooms();
    }
  }, [currentView]);

  const loadRooms = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${SERVER_URL}/api/rooms`);
      setRooms(response.data);
    } catch (err) {
      console.error('Ошибка загрузки комнат:', err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        onAuthError();
      } else {
        alert('Ошибка загрузки комнат');
      }
    }
    setLoading(false);
  };

  const createRoom = async () => {
    const name = prompt('Название комнаты:');
    if (!name) return;

    try {
      await axios.post(`${SERVER_URL}/api/rooms`, { name });
      loadRooms();
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        onAuthError();
      } else {
        alert('Ошибка создания комнаты');
      }
    }
  };

  const joinRoom = (room) => {
    setSelectedRoom(room);
    setCurrentView('meeting');
  };

  const leaveRoom = () => {
    setSelectedRoom(null);
    setCurrentView('rooms');
  };

  if (currentView === 'meeting' && selectedRoom) {
    return (
      <VideoMeeting 
        room={selectedRoom} 
        token={token} 
        user={user}
        onLeave={leaveRoom}
        onAuthError={onAuthError}
      />
    );
  }

  return (
    <div className="rooms-container">
      <div className="rooms-header">
        <h3>Комнаты</h3>
        <button className="btn" onClick={createRoom}>
          Создать комнату
        </button>
      </div>
      
      {loading ? (
        <div>Загрузка...</div>
      ) : (
        <div className="rooms-grid">
          {rooms.map(room => (
            <div key={room.id} className="room-card">
              <h4>{room.name}</h4>
              <p>Создана: {new Date(room.created_at).toLocaleDateString()}</p>
              <p>Автор: {room.created_by_username}</p>
              <button className="btn" onClick={() => joinRoom(room)}>
                Присоединиться
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VideoMeeting({ room, token, user, onLeave, onAuthError }) {
  const OV = useRef(null);
  const sessionRef = useRef(null);
  const publisherRef = useRef(null);
  const socketRef = useRef(null);
  
  const [joined, setJoined] = useState(false);
  const [subscribers, setSubscribers] = useState([]);
  const [recordingId, setRecordingId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showChat, setShowChat] = useState(true);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  
  // Media state
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  
  const localVideoRef = useRef(null);
  const chatRef = useRef(null);

  useEffect(() => {
    OV.current = new OpenVidu();
    
    // Initialize socket
    socketRef.current = io(SERVER_URL);
    socketRef.current.on('new-message', (message) => {
      setMessages(prev => [...prev, message]);
      scrollToBottom();
    });

    join();
    loadMessages();

    return () => {
      if (sessionRef.current) sessionRef.current.disconnect();
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (chatRef.current) {
        chatRef.current.scrollTop = chatRef.current.scrollHeight;
      }
    }, 100);
  };

  const loadMessages = async () => {
    try {
      const response = await axios.get(`${SERVER_URL}/api/rooms/${room.session_id}/messages`);
      setMessages(response.data);
      scrollToBottom();
    } catch (err) {
      console.error('Ошибка загрузки сообщений:', err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        onAuthError();
      }
    }
  };

  const join = async () => {
    try {
      const { data } = await axios.post(`${SERVER_URL}/api/session`, {
        sessionId: room.session_id,
      });
      const sessionToken = data.token;
      const session = OV.current.initSession();
      sessionRef.current = session;

      session.on("streamCreated", (event) => {
        const subscriber = session.subscribe(event.stream, undefined);
        setSubscribers((s) => [...s, subscriber]);
      });

      session.on("streamDestroyed", (event) => {
        setSubscribers((s) => s.filter((sub) => sub.stream !== event.stream));
      });

      session.on("exception", (exception) => {
        console.warn("OpenVidu exception:", exception);
      });

      await session.connect(sessionToken);

      const publisher = OV.current.initPublisher(undefined, {
        publishAudio: isMicOn,
        publishVideo: isCameraOn,
        resolution: "640x480",
        frameRate: 30,
      });
      publisherRef.current = publisher;
      
      publisher.on("accessAllowed", () => {
        if (localVideoRef.current) {
          publisher.addVideoElement(localVideoRef.current);
        }
      });

      publisher.on("accessDenied", () => {
        alert("Доступ к камере/микрофону запрещен");
      });
      
      session.publish(publisher);
      
      // Join chat room
      socketRef.current.emit('join-room', room.session_id);
      
      setJoined(true);
    } catch (err) {
      console.error(err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        onAuthError();
      } else {
        alert("Ошибка подключения к комнате: " + (err.message || err));
      }
    }
  };

  const leave = () => {
    if (sessionRef.current) sessionRef.current.disconnect();
    setSubscribers([]);
    setJoined(false);
    setRecordingId(null);
    setIsSharingScreen(false);
    onLeave();
  };

  const toggleCam = () => {
    if (!publisherRef.current) return;
    const newState = !isCameraOn;
    publisherRef.current.publishVideo(newState);
    setIsCameraOn(newState);
  };

  const toggleMic = () => {
    if (!publisherRef.current) return;
    const newState = !isMicOn;
    publisherRef.current.publishAudio(newState);
    setIsMicOn(newState);
  };

  const toggleScreenShare = async () => {
    if (!sessionRef.current) return;
    
    try {
      if (isSharingScreen) {
        // Stop screen sharing, go back to camera
        const publisher = OV.current.initPublisher(undefined, {
          publishAudio: isMicOn,
          publishVideo: isCameraOn,
          resolution: "640x480",
          frameRate: 30,
        });
        
        await sessionRef.current.unpublish(publisherRef.current);
        
        publisher.on("accessAllowed", async () => {
          publisherRef.current = publisher;
          
          if (localVideoRef.current) {
            publisher.addVideoElement(localVideoRef.current);
          }
          
          await sessionRef.current.publish(publisher);
          setIsSharingScreen(false);
        });

        publisher.on("accessDenied", () => {
          alert("Доступ к камере запрещен");
          setIsSharingScreen(false);
        });
        
      } else {
        // Start screen sharing
        const screenPublisher = OV.current.initPublisher(undefined, {
          videoSource: "screen",
          publishAudio: false, // Avoid echo
          publishVideo: true,
        });
        
        screenPublisher.on("accessAllowed", async () => {
          await sessionRef.current.unpublish(publisherRef.current);
          publisherRef.current = screenPublisher;
          
          if (localVideoRef.current) {
            screenPublisher.addVideoElement(localVideoRef.current);
          }
          
          await sessionRef.current.publish(screenPublisher);
          setIsSharingScreen(true);
        });

        screenPublisher.on("accessDenied", () => {
          alert("Доступ к демонстрации экрана запрещен");
        });
      }
    } catch (err) {
      console.error("Screen share error:", err);
      alert("Ошибка демонстрации экрана: " + err.message);
    }
  };

  const startRecording = async () => {
    try {
      const r = await axios.post(`${SERVER_URL}/api/recordings/start`, {
        session: room.session_id,
      });
      setRecordingId(r.data.id);
      alert("Запись началась");
    } catch (err) {
      console.error(err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        onAuthError();
      } else {
        alert("Не удалось начать запись: " + (err.response?.data?.error || err.message));
      }
    }
  };

  const stopRecording = async () => {
    try {
      if (!recordingId) return;
      await axios.post(`${SERVER_URL}/api/recordings/stop`, { recordingId });
      setRecordingId(null);
      alert("Запись остановлена");
    } catch (err) {
      console.error(err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        onAuthError();
      } else {
        alert("Не удалось остановить запись: " + (err.response?.data?.error || err.message));
      }
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    socketRef.current.emit('send-message', {
      sessionId: room.session_id,
      message: newMessage,
      token: localStorage.getItem('token')
    });

    setNewMessage('');
  };

  return (
    <div className="meeting-container">
      <div className="meeting-header">
        <h3>{room.name}</h3>
        <div className="meeting-controls">
          <button 
            className={`control-btn ${isCameraOn ? 'active' : 'inactive'}`} 
            onClick={toggleCam}
          >
            📹 {isCameraOn ? 'Выключить камеру' : 'Включить камеру'}
          </button>
          <button 
            className={`control-btn ${isMicOn ? 'active' : 'inactive'}`} 
            onClick={toggleMic}
          >
            🎤 {isMicOn ? 'Выключить микрофон' : 'Включить микрофон'}
          </button>
          <button 
            className={`control-btn ${isSharingScreen ? 'active' : ''}`} 
            onClick={toggleScreenShare}
          >
            {isSharingScreen ? '🖥️ Остановить показ' : '🖥️ Показать экран'}
          </button>
          {!recordingId ? (
            <button className="control-btn record" onClick={startRecording}>
              ⏺️ Начать запись
            </button>
          ) : (
            <button className="control-btn record active" onClick={stopRecording}>
              ⏹️ Остановить запись
            </button>
          )}
          <button className="control-btn" onClick={() => setShowChat(!showChat)}>
            💬 {showChat ? 'Скрыть чат' : 'Показать чат'}
          </button>
          <button className="control-btn leave" onClick={leave}>
            📞 Выйти
          </button>
        </div>
      </div>

      <div className="meeting-content">
        <div className="video-area">
          <div className="main-video">
            <div className="video-wrapper">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="local-video"
              />
              <div className="video-label">
                Вы {isSharingScreen && '(показ экрана)'}
                <div className="media-status">
                  {isCameraOn ? '📹' : '📹❌'} {isMicOn ? '🎤' : '🎤❌'}
                </div>
              </div>
            </div>
          </div>
          
          {subscribers.length > 0 && (
            <div className="remote-videos">
              {subscribers.map((sub, idx) => (
                <Participant key={idx} subscriber={sub} />
              ))}
            </div>
          )}
        </div>

        {showChat && (
          <div className="chat-panel">
            <div className="chat-header">
              <h4>Чат</h4>
              <button onClick={() => setShowChat(false)}>✕</button>
            </div>
            
            <div className="chat-messages" ref={chatRef}>
              {messages.map((msg, idx) => (
                <div key={idx} className="chat-message">
                  <strong>{msg.username}:</strong> {msg.message}
                </div>
              ))}
            </div>
            
            <form className="chat-input" onSubmit={sendMessage}>
              <input
                type="text"
                placeholder="Введите сообщение..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
              />
              <button type="submit">Отправить</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function Participant({ subscriber }) {
  const ref = useRef(null);
  const [connectionData, setConnectionData] = useState(null);

  useEffect(() => {
    if (ref.current) subscriber.addVideoElement(ref.current);
    
    // Try to get connection data
    try {
      const data = JSON.parse(subscriber.stream.connection.data);
      setConnectionData(data);
    } catch (e) {
      setConnectionData({ username: 'Участник' });
    }
  }, [subscriber]);

  return (
    <div className="participant">
      <div className="video-wrapper">
        <video
          ref={ref}
          autoPlay
          playsInline
          className="remote-video"
        />
        <div className="video-label">
          {connectionData?.username || 'Участник'}
          <div className="media-status">
            {subscriber.stream.videoActive ? '📹' : '📹❌'} 
            {subscriber.stream.audioActive ? '🎤' : '🎤❌'}
          </div>
        </div>
      </div>
    </div>
  );
}
