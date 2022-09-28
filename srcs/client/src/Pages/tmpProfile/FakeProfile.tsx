import { FC, useCallback, useContext, useEffect, useState } from 'react';
import getFetch from '../../Components/Tools/getFetch';
import { SocketContext } from '../../socket';
import { useLocation } from 'react-router-dom';
import '../../Styles';
import { Link } from 'react-router-dom';

const FakeProfile: FC = (props: any) => {
  const socket = useContext(SocketContext);
  const location: any = useLocation();
  const { id } = location.state;

  /** *********************************************************************** */
  /** ENUMS                                                                   */
  /** *********************************************************************** */

  enum ePlayerStatus {
    OFFLINE = 0,
    ONLINE,
    PLAYING,
    SPECTATING,
  }

  /** *********************************************************************** */
  /** STATES                                                                  */
  /** *********************************************************************** */

  const [player, setPlayer] = useState({} as any);
  const [user, setUser] = useState({} as any);

  /** *********************************************************************** */
  /** SOCKET EVENTS HANDLERS                                                  */
  /** *********************************************************************** */

  const handlePlayersInfo = useCallback((data: any) => {
    const player = data.players
      ? data.players.find((p: any) => p.id === id.toString())
      : {};
    console.log(player);
    setPlayer(player);
  }, []);

  /** *********************************************************************** */
  /** INITIALIZATION                                                          */
  /** *********************************************************************** */

  const getUserInfos = async () => {
    const request = `http://127.0.0.1:4200/users/${id}`;
    const user_json = await getFetch({ url: request });
    user_json.then((responseObject: any) => {
      setUser(responseObject);
    });
  };

  const init = async () => {
    socket.emit('getPlayerInfo', { id: id });
  };

  useEffect(() => {
    //getUserInfos();
    init();
    socket.on('playersInfos', handlePlayersInfo);
    return () => {
      socket.off('playersInfos', handlePlayersInfo);
    };
  }, []);

  /** *********************************************************************** */
  /** RENDER                                                                  */
  /** *********************************************************************** */

  return (
    <div>
      <h1 className="text-pink">Fake profile page</h1>
      {player && player.status !== undefined ? (
        <h4 className="text-blue">
          {player.status === 0 && `player is offline` }
          {player.status === 1 && `player is online` }
          {player.status === 3 && `player is spectating a game` }
          {player.status === 2 &&     
            <>
              player is playing a game
              <Link
                to="/lobby"
                state={{
                  origin: {
                    name: 'profile',
                    loc: '/prof',
                    state: location.state,
                  },
                  gameId: player.game,
                  action: ePlayerStatus.PLAYING,
                }}
                className="btn btn-pink text-pink"
              >
                Join
              </Link>
            </>
          }
        </h4>
      ) : (
        <h4 className="text-blue">player is not in game</h4>
      )}
    </div>
  );
};

export default FakeProfile;
