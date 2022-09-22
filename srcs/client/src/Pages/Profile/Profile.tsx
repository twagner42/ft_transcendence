import React from "react";
import {useState, useEffect} from 'react'
import "./profile.css"
import "../../Components/Tools/Text.css"
import "../../Components/Tools/Box.css"
import AddFriend from './Button/AddFriend'
import BlockFriend from './Button/BlockFriend'
import PhotoProfil from '../../Components/Tools/Button/PhotoProfil'
import OnlineOffline from './OnlineOffline'
import ChangePseudo from './Button/ChangePseudo'
import ChangePicture from './Button/ChangePicture'
import DoubleAuth from './Button/DoubleAuth'
import Ladder from './Ladder'
import MatchHistory from './MatchHistory'
import FriendList from './FriendList'
import {getFetch} from './Fetch/getFetch'
import {getFetchMatch} from './Fetch/getFetchMatch'
import {getFetchFriends} from './Fetch/getFetchFriends'
import { useLocation } from "react-router-dom";

export default function Profile () {

    let location = useLocation();
    const {userID} : any  = location.state;
    const {originalId} : any  = location.state;
    const [user, setUser] : any = useState(null);
    const [friendList, setFriendList] : any = useState([]);
    const [matchesList, setMatchesList] : any = useState([]);
    const [update, setUpdate] = useState(2);

    function toggleUpdate() {
        setTimeout(() => {
            if (update === 2)
		        setUpdate(1);
            if (update === 1)
		        setUpdate(0);
            if (update === 0)
		        setUpdate(1);
        }, 100);
	}

    // useEffect(() => {
    //     let request = "http://127.0.0.1:4200/users/" + userID;
    //     console.log(request);
    //     const user_json = getFetch({url : request});
    //     user_json.then((responseObject)=> {
    //         // console.log("User =>", responseObject);
    //         setUser(responseObject);
    //     })
    //     request = "http://127.0.0.1:4200/users/" + userID + "/friends";
    //     const friend_json = getFetchFriends({url : request});
    //     friend_json.then((responseObject)=> {
    //         // console.log("Friend =>", responseObject);
    //         setFriendList(responseObject);})
    //     request = "http://127.0.0.1:4200/users/" + userID + "/matches";
    //         const matches_json = getFetchMatch({url : request});
    //         matches_json.then((responseObject)=> {
    //             // console.log("Matches =>", responseObject);
    //             setMatchesList(responseObject);})
    //     },[userID, update]);

    console.log(user);
    // if(user)
    // {
        return (
            <>
            <div className="profilAndLadder" data-testid="tracker">
                <div className="profil">
                    <div className="picture">
                        {/* <PhotoProfil url={user.profilePicture} width={"10vw"} height={"10vw"}/> */}
                    </div>
                    <div className="status">
                        {/* <div className="yellowTextProfil" style={{fontSize: "2vw", fontWeight: "bold"}}> {user.username}</div> */}
                        <br/>
                        {/* <OnlineOffline status={user.currentStatus} size={"1.5vw"}/> */}
                        {/* faire un bouton permettant de passer offline */}
                    </div>
                    <div className="changeProfil">
                        { userID === originalId ?
                        <>
                            <ChangePseudo id={userID} up={toggleUpdate}/>
                            <ChangePicture id={userID} up={toggleUpdate}/>
                            <DoubleAuth/>
                        </>
                        :
                        <>
                            <AddFriend id={userID} originalId={originalId}/>
                            <BlockFriend id={userID} originalId={originalId}/>
                        </>
                        }
                    </div>
                    </div>
                    <div className="ladder">
                            <Ladder />
                            {/* <Ladder stats={user.stats} elo={user.eloRating}/> */}
                </div>
            </div>
            <div className='matchFriend'>
                <div className="match">
                    <MatchHistory matchesList={matchesList} id={userID}/>
                </div>
                <div className="friend">
                    <FriendList friendList={friendList} id={userID} originalId={originalId}/>
                </div>
            </div>

            </>
        );
    // }
    return(<></>);
}

// chaque variable avec [] possede une variable lenght qui sera egale a 0 s'il n'y a rien
// ex : user.friendshipRequested.lenght  ? affiche ca : sinon affiche ca
// SANS RIEN DEDANS
// {
//     "id": 1,
//     "username": "fmonbeig",
//     "email": "fmonbeig@student.42.fr",
//     "createdAt": "2022-09-02T13:22:33.662Z",
//     "profilePicture": "https://cdn.intra.42.fr/users/fmonbeig.jpg",
//     "currentStatus": 1,
//     "eloRating": 1000,
//     "stats": null,
//     "ratingHistory": [],
//     "ownedChannels": [],
//     "channels": [],
//     "friendshipRequested": [],
//     "friendshipAddressed": [],
//     "matches": [],
//     "achievements": []
//   }

    // USER
//{id: 1, username: 'fmonbeig', email: 'fmonbeig@student.42.fr',
//createdAt: '2022-09-01T09:00:06.542Z',
//profilePicture: 'https://cdn.intra.42.fr/users/fmonbeig.jpg', …}


    // const [test, setTest] : any = useState(
    //     {
    //         "id": 1,
    //         "username": "fmonbeig",
    //         "email": "fmonbeig@student.42.fr",
    //         "createdAt": "2022-09-02T13:22:33.662Z",
    //         "profilePicture": "https://cdn.intra.42.fr/users/fmonbeig.jpg",
    //         "currentStatus": 1,
    //         "eloRating": 1000,
    //             "stats": {
    //             "id": 0,Matcvarssed": [],
    //         "matches": [],
    //         "achievements": []
    //       }
    // )
