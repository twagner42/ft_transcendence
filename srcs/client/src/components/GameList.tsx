const GameList = (props: any) => {
  // styles
  const styles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
  };

  return (
    <div style={styles}>
      {props.gameList.length > 0 ? (
        <ul style={{ listStyleType: "none" }}>
          {props.gameList.map((game: any, index: number) => (
            <li key={index}>
              Game #<b>{game.players[0] ? game.players[0].userId : " ... "}</b>{" "}
              vs #<b>{game.players[1] ? game.players[1].userId : " ... "}</b> (
              {game.viewersCount} viewers)
              <button
                onClick={() =>
                  props.setGame({
                    id: game.id,
                    action: props.actionVal.VIEW_GAME,
                  })
                }
              >
                Spectate
              </button>
              {game.players.length === 1 && (
                <button
                  onClick={() =>
                    props.setGame({
                      id: game.id,
                      action: props.actionVal.JOIN_GAME,
                    })
                  }
                >
                  Join
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>No games...</p>
      )}
      <button onClick={props.handleNewGame}>Create New Game</button>
    </div>
  );
};

export default GameList;
