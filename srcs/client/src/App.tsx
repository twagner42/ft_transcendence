import React, { useState } from 'react';
import './Components/Tools/App.css';
import {Routes, Route} from 'react-router-dom';
import Home from './Pages/Home/home'
import Profile from './Pages/Profile/Profile'
import Notfound from './Pages/NotFound/notFound';
import NavBar from './Components/NavBar/NavBar';
import { hasAuthenticated } from './Components/services/authApi';
import AuthenticatedRoute from './Components/services/authenticatedRoute';
import setIsAuthenticated from './Components/services/authenticatedRoute';
import Login from './Pages/Login/Login';
import Auth from './Components/Context/Auth';
import About from './Pages/About/about';
import Leaderboard from './Pages/Leaderboard/leaderboard';
import Chat from './Pages/Chat/chat';


function App() {
  
  const[isAuthenticated, setIsAuthenticated] = useState(hasAuthenticated);

  return (

        <div className="main">
          <NavBar />
            <Routes>
            <Route path="*" element={<Notfound />} />
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route  path='/' element={<AuthenticatedRoute setIsAuthenticated/>}>
              < Route path="/home" element={<Home />} />
              < Route path="/about" element={<About />} />
              < Route path="/chat" element={<Chat />} />
              < Route path="/leaderboard" element={<Leaderboard />} />
              < Route path="/profile/:id" element={<Profile />} />
              <Route path="/profile/:id/friends" element={<Profile />} />
            </Route>
          </Routes>
        </div>
      
  );
}

export default App;


// <div className="main">
// <NavBar />
//   <Routes>
//   <Route path="/" element={<Home />} />
//   <Route path="*" element={<Notfound />} />
//   <Route  path='/' element={<AuthenticatedRoute setIsAuthenticated/>}>
//     < Route path="/profile/:id" element={<Profile />} />
//   </Route>
// </Routes>
// </div>

        //  <NavBar />
        //     <Routes>
        //     <Route path="/" element={<Home />} />
        //     <Route path="*" element={<Notfound />} />
        //     <Route  path='/' element={<AuthenticatedRoute/>}>
        //       < Route path="/profile/:id" element={<Profile />} />
        //     </Route>
        //   </Routes>
        // </div>