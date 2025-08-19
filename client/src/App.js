import React, { useEffect, useRef, useState } from "react";
import { OpenVidu } from "openvidu-browser";
import axios from "axios";
import io from "socket.io-client";
import "./styles.css";

// const SERVER_URL = "http://localhost:5005";
const SERVER_URL = "https://api.meetings.koktem2.kz";

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
  
  // Local recording state
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordedChunks, setRecordedChunks] = useState([]);
  
  // Participants state
  const [participants, setParticipants] = useState([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const [userRole, setUserRole] = useState('participant');
  
  const localVideoRef = useRef(null);
  const chatRef = useRef(null);

  useEffect(() => {
    OV.current = new OpenVidu();
    
    // Initialize socket
    socketRef.current = io(SERVER_URL);
    
    // Socket event handlers
    socketRef.current.on('new-message', (message) => {
      setMessages(prev => [...prev, message]);
      scrollToBottom();
    });

    socketRef.current.on('participants-list', (participantsList) => {
      setParticipants(participantsList);
      // Check user role
      const currentUserParticipant = participantsList.find(p => p.user_id === user.id);
      if (currentUserParticipant) {
        setUserRole(currentUserParticipant.role);
      }
    });

    socketRef.current.on('participant-joined', (participant) => {
      console.log('Participant joined:', participant);
      loadParticipants();
    });

    socketRef.current.on('participant-left', (data) => {
      console.log('Participant left:', data);
      setParticipants(prev => prev.filter(p => p.user_id !== data.userId));
    });

    socketRef.current.on('participant-muted', (data) => {
      console.log('Participant muted:', data);
      setParticipants(prev => prev.map(p => 
        p.user_id === data.userId 
          ? { ...p, is_muted: data.isMuted }
          : p
      ));
      
      if (data.userId === user.id) {
        alert(data.isMuted 
          ? `Вы были заглушены администратором ${data.mutedBy}` 
          : `Ваш микрофон был включен администратором ${data.mutedBy}`);
      }
    });

    socketRef.current.on('message-blocked', (data) => {
      alert(data.reason);
    });

    socketRef.current.on('error', (data) => {
      alert(data.message);
    });

    join();
    loadMessages();
    loadParticipants();

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

  const loadParticipants = async () => {
    try {
      const response = await axios.get(`${SERVER_URL}/api/rooms/${room.session_id}/participants`);
      setParticipants(response.data);
      // Check user role
      const currentUserParticipant = response.data.find(p => p.user_id === user.id);
      if (currentUserParticipant) {
        setUserRole(currentUserParticipant.role);
      }
    } catch (err) {
      console.error('Ошибка загрузки участников:', err);
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
      const openviduUrl = data.openviduUrl;
      
      console.log('Backend response data:', data);
      console.log('OpenVidu URL from backend:', openviduUrl);
      console.log('Session token:', sessionToken);
      
      // Configure OpenVidu with the correct server URL
      console.log('Configuring OpenVidu with serverUrl:', openviduUrl);
      
      // Create new OpenVidu instance
      OV.current = new OpenVidu();
      OV.current.setAdvancedConfiguration({
        serverUrl: openviduUrl,
        forceMediaReconnectionAfterNetworkDrop: true
      });
      
      console.log('OpenVidu configured successfully');
      
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

      // Join socket room with token
      socketRef.current.emit("join-room", {
        sessionId: room.session_id,
        token
      });

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
    // Stop recording if active
    if (isRecording) {
      stopLocalRecording();
    }
    
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
      token: token  // Use the token prop instead of localStorage
    });

    setNewMessage('');
  };

  const toggleParticipantMute = (participantUserId, currentMutedStatus) => {
    if (userRole !== 'admin') {
      alert('Только администраторы могут управлять участниками');
      return;
    }

    const participant = participants.find(p => p.user_id === participantUserId);
    const action = currentMutedStatus ? 'включить микрофон' : 'заглушить';
    
    if (window.confirm(`Вы уверены, что хотите ${action} у ${participant?.username}?`)) {
      socketRef.current.emit('mute-participant', {
        sessionId: room.session_id,
        targetUserId: participantUserId,
        isMuted: !currentMutedStatus,
        token: token
      });
    }
  };

  // Local recording functions
  const startLocalRecording = async () => {
    try {
      console.log('Начинаем локальную запись...');
      
      // Get screen capture
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          mediaSource: 'screen',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: true
      });

      // Get microphone audio to mix with system audio
      let micStream = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100
          }
        });
      } catch (err) {
        console.log('Микрофон недоступен, запись только системного звука');
      }

      // Create audio context for mixing audio streams
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const destination = audioContext.createMediaStreamDestination();

      // Add screen audio if available
      const screenAudioTracks = screenStream.getAudioTracks();
      if (screenAudioTracks.length > 0) {
        const screenAudioSource = audioContext.createMediaStreamSource(
          new MediaStream(screenAudioTracks)
        );
        screenAudioSource.connect(destination);
        console.log('Добавлен системный звук');
      }

      // Add microphone audio if available
      if (micStream) {
        const micAudioSource = audioContext.createMediaStreamSource(micStream);
        micAudioSource.connect(destination);
        console.log('Добавлен звук микрофона');
      }

      // Add OpenVidu audio streams if available
      if (publisherRef.current && publisherRef.current.stream) {
        try {
          const publisherStream = publisherRef.current.stream.getMediaStream();
          const publisherAudioTracks = publisherStream.getAudioTracks();
          if (publisherAudioTracks.length > 0) {
            const publisherAudioSource = audioContext.createMediaStreamSource(
              new MediaStream(publisherAudioTracks)
            );
            publisherAudioSource.connect(destination);
            console.log('Добавлен звук от вашего микрофона через OpenVidu');
          }
        } catch (err) {
          console.log('Не удалось добавить аудио от publisher:', err);
        }
      }

      // Add subscribers audio streams
      subscribers.forEach((subscriber, index) => {
        try {
          if (subscriber.stream) {
            const subscriberStream = subscriber.stream.getMediaStream();
            const subscriberAudioTracks = subscriberStream.getAudioTracks();
            if (subscriberAudioTracks.length > 0) {
              const subscriberAudioSource = audioContext.createMediaStreamSource(
                new MediaStream(subscriberAudioTracks)
              );
              subscriberAudioSource.connect(destination);
              console.log(`Добавлен звук от участника ${index + 1}`);
            }
          }
        } catch (err) {
          console.log(`Не удалось добавить аудио от участника ${index + 1}:`, err);
        }
      });

      // Combine video from screen with mixed audio
      const combinedStream = new MediaStream([
        ...screenStream.getVideoTracks(),
        ...destination.stream.getAudioTracks()
      ]);

      // Check if browser supports the codec
      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }

      const recorder = new MediaRecorder(combinedStream, { mimeType });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setRecordedChunks(prev => [...prev, event.data]);
        }
      };

      recorder.onstop = () => {
        downloadRecording();
        setIsRecording(false);
        setMediaRecorder(null);
      };

      // Store references for cleanup
      recorder.audioContext = audioContext;
      recorder.screenStream = screenStream;
      recorder.micStream = micStream;

      // Handle when user stops screen sharing manually
      screenStream.getVideoTracks()[0].addEventListener('ended', () => {
        console.log('Запись остановлена пользователем');
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      });

      recorder.start(1000); // Record in 1-second chunks
      setMediaRecorder(recorder);
      setIsRecording(true);
      
      // Show success message with instructions
      alert(`✅ Запись началась успешно!\n\n📹 Видео: записывается выбранная область экрана\n🎵 Звук: записывается микс из всех источников\n\n💡 Для лучшего качества звука:\n• Выберите "Поделиться звуком" в диалоге\n• Убедитесь что звук встречи включен\n• Проговорите тестовую фразу`);
      
      console.log('Запись началась с многоканальным аудио');
    } catch (error) {
      console.error('Ошибка при начале записи:', error);
      alert('❌ Не удалось начать запись.\n\nВозможные решения:\n• Разрешите доступ к экрану\n• Выберите "Поделиться звуком"\n• Попробуйте обновить страницу');
    }
  };

  const stopLocalRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      
      // Clean up resources
      if (mediaRecorder.audioContext) {
        mediaRecorder.audioContext.close();
      }
      
      if (mediaRecorder.screenStream) {
        mediaRecorder.screenStream.getTracks().forEach(track => track.stop());
      }
      
      if (mediaRecorder.micStream) {
        mediaRecorder.micStream.getTracks().forEach(track => track.stop());
      }
      
      setIsRecording(false);
      setMediaRecorder(null);
      console.log('Запись остановлена и ресурсы освобождены');
    }
  };

  const downloadRecording = () => {
    if (recordedChunks.length === 0) {
      console.log('Нет данных для скачивания');
      return;
    }

    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    // Create a readable filename
    const now = new Date();
    const date = now.toLocaleDateString('ru-RU').replace(/\./g, '-');
    const time = now.toLocaleTimeString('ru-RU', { hour12: false }).replace(/:/g, '-');
    const roomName = room.name.replace(/[^a-zA-Z0-9а-яё\s]/gi, '').replace(/\s+/g, '_');
    
    a.href = url;
    a.download = `Встреча_${roomName}_${date}_${time}.webm`;
    a.click();
    
    URL.revokeObjectURL(url);
    setRecordedChunks([]);
    
    // Show success message
    alert(`🎬 Запись сохранена!\n\n📁 Файл: Встреча_${roomName}_${date}_${time}.webm\n📂 Папка: Загрузки\n\n💡 Совет: Проверьте качество звука перед следующей записью`);
    console.log('Запись успешно сохранена с аудио');
  };

  return (
    <div className="meeting-container">
      <div className="meeting-header">
        <div className="meeting-title">
          <h3>{room.name}</h3>
          {isRecording && (
            <div className="recording-indicator">
              <span className="recording-dot"></span>
              ЗАПИСЬ
            </div>
          )}
        </div>
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
          {!isRecording ? (
            <button className="control-btn record" onClick={startLocalRecording}>
              ⏺️ Начать запись
            </button>
          ) : (
            <button className="control-btn record active" onClick={stopLocalRecording}>
              ⏹️ Остановить запись
            </button>
          )}
          <button className="control-btn" onClick={() => setShowChat(!showChat)}>
            💬 {showChat ? 'Скрыть чат' : 'Показать чат'}
          </button>
          <button className="control-btn" onClick={() => setShowParticipants(!showParticipants)}>
            👥 {showParticipants ? 'Скрыть участников' : 'Участники'} ({participants.length})
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

        {showParticipants && (
          <div className="participants-panel">
            <div className="participants-header">
              <h4>Участники ({participants.length})</h4>
              <button onClick={() => setShowParticipants(false)}>✕</button>
            </div>
            
            <div className="participants-list">
              {participants.map((participant) => (
                <div key={participant.user_id} className="participant-item">
                  <div className="participant-info">
                    <div className="participant-name">
                      {participant.username}
                      {participant.role === 'admin' && (
                        <span className="admin-badge">👑 Админ</span>
                      )}
                    </div>
                    <div className="participant-status">
                      {participant.is_muted ? '🎤❌ Заглушен' : '🎤 Активен'}
                    </div>
                  </div>
                  
                  {userRole === 'admin' && participant.user_id !== user.id && (
                    <div className="participant-actions">
                      <button 
                        className={`action-btn ${participant.is_muted ? 'unmute' : 'mute'}`}
                        onClick={() => toggleParticipantMute(participant.user_id, participant.is_muted)}
                      >
                        {participant.is_muted ? '🔊 Включить' : '🔇 Заглушить'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

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
