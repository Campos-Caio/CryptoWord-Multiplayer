const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const nicknameInput = document.getElementById('nickname-input');
const joinGameButton = document.getElementById('join-game-button');
const lobbyMessage = document.getElementById('lobby-message');
const countdownDisplay = document.getElementById('countdown-display');

const usernameDisplay = document.getElementById("username-display");
const pontuacaoDisplay = document.getElementById("pontuacao");
const gridContainer = document.getElementById("grid");
const listaJogadoresEl = document.getElementById("lista-jogadores"); 
const wordListEl = document.getElementById("word-list"); // Novo elemento para a lista de palavras
const feedbackMessageElement = document.getElementById("feedback-message");

const submitSelectionButton = document.getElementById('submit-selection-button');
const clearSelectionButton = document.getElementById('clear-selection-button');
const currentSelectionText = document.getElementById('current-selection-text');
const leaveGameButton = document.getElementById('leave-game-button'); // Novo botão "Sair da Sala"

// Estado do cliente
let username = '';

// --- ALTERAÇÃO AQUI: Conexão WebSocket para ambiente de produção (HTTPS/WSS) ---
// Se a página for carregada via HTTPS, o navegador forçará WSS para o WebSocket
// Se for local (localhost), usará WS
const SOCKET_PROTOCOL = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
const SOCKET_HOST = window.location.host; // Usa o mesmo host da página atual (ex: cryptoword-multiplayer.onrender.com)

const socket = new WebSocket(`${SOCKET_PROTOCOL}${SOCKET_HOST}`);
// -----------------------------------------------------------------------------

let cellsData = []; // Armazena dados das células do grid: { x, y, letter, element }
let selectedPath = []; // Armazena células selecionadas: { x, y, letter, element }
let gameWords = []; // Armazena as palavras do jogo atual para a exibição do cliente

// --- Lógica de UI e Telas ---
function switchScreen(showScreen, hideScreen) {
    hideScreen.classList.add('hidden');
    showScreen.classList.remove('hidden');
}

function showLobby() {
    switchScreen(lobbyScreen, gameScreen);
    countdownDisplay.classList.add('hidden');
    lobbyMessage.classList.remove('hidden');
    joinGameButton.disabled = false;
    nicknameInput.disabled = false;
    // Clear username and game state on leaving the game
    username = '';
    usernameDisplay.textContent = '';
    pontuacaoDisplay.textContent = '0';
    clearSelection();
    gridContainer.innerHTML = ''; // Clear grid
    listaJogadoresEl.innerHTML = ''; // Clear player list
    wordListEl.innerHTML = ''; // Clear word list
}

function showGame() {
    switchScreen(gameScreen, lobbyScreen);
    countdownDisplay.classList.add('hidden');
    lobbyMessage.classList.add('hidden');
}

// --- Lógica de Seleção no Grid ---
function updateCurrentSelectionDisplay() {
    const word = selectedPath.map(cell => cell.letter).join('');
    currentSelectionText.textContent = `Selecionado: ${word}`;
}

function clearSelection() {
    selectedPath.forEach(cellData => cellData.element.classList.remove('selected'));
    selectedPath = [];
    updateCurrentSelectionDisplay();
}

function handleCellClick(cellData) {
    const existingCellIndex = selectedPath.findIndex(sc => sc.element === cellData.element);

    if (existingCellIndex !== -1) { // Célula já está na seleção
        if (existingCellIndex === selectedPath.length - 1) { // Clicou na última selecionada para remover
            selectedPath.pop();
            cellData.element.classList.remove('selected');
        } else { // Clicou numa célula no meio do caminho, reseta até ela
            selectedPath.splice(existingCellIndex + 1).forEach(cd => cd.element.classList.remove('selected'));
        }
    } else { // Nova célula para adicionar
        if (selectedPath.length > 0) {
            const lastCell = selectedPath[selectedPath.length - 1];
            const dx = cellData.x - lastCell.x;
            const dy = cellData.y - lastCell.y;
            const isAdjacent = (Math.abs(dx) + Math.abs(dy) === 1); // Adjacência H/V

            let isValidExtension = false;
            if (isAdjacent) {
                if (selectedPath.length === 1) { // Segunda letra, estabelece direção
                    isValidExtension = true;
                } else { // Terceira ou mais, deve seguir a direção
                    const prevLastCell = selectedPath[selectedPath.length - 2];
                    const established_dx = lastCell.x - prevLastCell.x;
                    const established_dy = lastCell.y - prevLastCell.y;
                    if (dx === established_dx && dy === established_dy) {
                        isValidExtension = true;
                    }
                }
            }

            if (!isValidExtension) { // Quebrou a linha ou não adjacente
                clearSelection(); // Limpa a seleção anterior e começa uma nova
            }
        }
        selectedPath.push(cellData);
        cellData.element.classList.add('selected');
    }
    updateCurrentSelectionDisplay();
}

submitSelectionButton.addEventListener('click', () => {
    const word = selectedPath.map(cell => cell.letter).join('');
    if (word.length > 1) { // Geralmente palavras têm pelo menos 2 letras
        socket.send(JSON.stringify({ tipo: "palavra", palavra: word }));
        // Não limpa a seleção aqui, espera o feedback do servidor
    } else {
        displayGameFeedback("Selecione uma palavra mais longa.", "error");
    }
});

clearSelectionButton.addEventListener('click', clearSelection);
leaveGameButton.addEventListener('click', () => {
    socket.send(JSON.stringify({ tipo: "sair-sala" }));
    showLobby(); // Immediately switch to lobby screen
    displayLobbyMessage("Você saiu da sala.", "info");
});


// --- Renderização e Atualizações do Jogo ---
function renderizarGrid(gridMatrix) {
    gridContainer.innerHTML = "";
    cellsData = [];
    gridMatrix.forEach((linha, x) => {
        linha.forEach((letra, y) => {
            const div = document.createElement("div");
            div.classList.add("cell");
            div.textContent = letra;
            const cellDataObject = { x, y, letter: letra, element: div };
            div.addEventListener('click', () => handleCellClick(cellDataObject));
            cellsData.push(cellDataObject);
            gridContainer.appendChild(div);
        });
    });
    clearSelection(); // Limpa seleção ao renderizar novo grid
}

function destacarPalavraEncontrada(coordenadas) { 
    coordenadas.forEach(([x, y]) => {
        const cellData = cellsData.find(c => c.x === x && c.y === y);
        if (cellData) {
            cellData.element.classList.remove('selected'); // Remove seleção temporária se houver
            cellData.element.classList.add("found"); // Adiciona classe de palavra encontrada
        }
    });
}

function updatePontuacaoDisplay(pontuacaoAtual) {
    pontuacaoDisplay.textContent = pontuacaoAtual;
}

function updateListaJogadores(jogadores, pontuacoesObj) {
    listaJogadoresEl.innerHTML = "";
    const jogadoresComPontuacao = jogadores.map(nome => ({
        nome: nome,
        pontuacao: pontuacoesObj[nome] || 0
    }));

    jogadoresComPontuacao.sort((a, b) => b.pontuacao - a.pontuacao); // Ordena por pontuação

    jogadoresComPontuacao.forEach(jogador => {
        const li = document.createElement("li");
        li.textContent = `${jogador.nome}: ${jogador.pontuacao} pts`;
        if (jogador.nome === username) li.style.fontWeight = 'bold'; // Destaca o próprio jogador
        listaJogadoresEl.appendChild(li);
    });
}

function renderWordList(words, foundWords) {
    wordListEl.innerHTML = "";
    words.forEach(word => {
        const li = document.createElement("li");
        li.textContent = word;
        if (foundWords.includes(word)) { // Verifica se a palavra está na lista de encontradas
            li.classList.add("found-word");
        }
        wordListEl.appendChild(li);
    });
}

// --- Funções de Feedback ---
function displayLobbyMessage(message, type = 'info') {
    lobbyMessage.textContent = message;
    lobbyMessage.className = `message ${type}-message`; // Remove outras classes de tipo
    lobbyMessage.classList.remove('hidden');
}

function displayGameFeedback(message, type = 'info', duration = 3000) {
    feedbackMessageElement.textContent = message;
    feedbackMessageElement.className = `game-feedback visible ${type}-message`;

    if (duration > 0) {
        setTimeout(() => {
            feedbackMessageElement.classList.remove('visible');
            // Opcional: limpar texto após o fade out
            // setTimeout(() => feedbackMessageElement.textContent = "", 300); 
        }, duration);
    }
}

// --- Lógica de Conexão e Eventos WebSocket ---
socket.onopen = () => {
    console.log("Conectado ao servidor WebSocket.");
    displayLobbyMessage("Conectado! Escolha seu nickname.", "success");
};

socket.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);
        console.log("Msg recebida:", data);

        switch (data.tipo) {
            case "registrado":
                usernameDisplay.textContent = username;
                displayLobbyMessage(`Bem-vindo, ${data.jogador}! Aguardando outros...`, 'info');
                break;
            case "erro-registro":
                displayLobbyMessage(`Erro: ${data.mensagem}`, 'error');
                joinGameButton.disabled = false;
                nicknameInput.disabled = false;
                break;
            case "lobby-update":
                if (gameScreen.classList.contains('hidden')) { // Se ainda no lobby
                    displayLobbyMessage(data.mensagem || `Jogadores: ${data.jogadoresConectados}/${data.minJogadores}. Jogo ${data.jogoIniciado ? 'em andamento' : 'aguardando'}.`, 'info');
                }
                if (data.jogadores && data.pontuacoes) {
                    updateListaJogadores(data.jogadores, data.pontuacoes);
                }
                break;
            case 'contagem-regressiva':
                countdownDisplay.textContent = `Jogo começa em: ${data.tempo}s...`;
                countdownDisplay.classList.remove('hidden');
                lobbyMessage.classList.add('hidden');
                if (data.tempo <= 0) countdownDisplay.classList.add('hidden');
                break;
            case "jogo-iniciado":
                console.log("Jogo iniciado no cliente!");
                showGame();
                renderizarGrid(data.grid);
                updatePontuacaoDisplay(data.pontuacoes[username] || 0);
                updateListaJogadores(data.jogadores, data.pontuacoes);
                gameWords = data.todasPalavrasJogo; // Armazena as palavras do jogo
                renderWordList(gameWords, data.palavrasEncontradas); // Renderiza a lista de palavras
                displayGameFeedback("O jogo começou! Encontre as palavras.", "info", 5000);
                break;
            case "palavra-certa":
                clearSelection(); // Limpa a seleção após submissão bem-sucedida
                destacarPalavraEncontrada(data.coordenadas);
                if (data.pontuacoes) {
                    updatePontuacaoDisplay(data.pontuacoes[username] || 0);
                    updateListaJogadores(Object.keys(data.pontuacoes), data.pontuacoes);
                }
                renderWordList(gameWords, data.palavrasEncontradas); 
                displayGameFeedback(`"${data.palavra}" encontrada! 🎉 +10 pts`, "success");
                break;
            case "palavra-errada":
                clearSelection(); // Limpa a seleção após submissão errada
                displayGameFeedback(data.mensagem || "Palavra incorreta ou já encontrada!", "error");
                break;
            case "fim-de-rodada":
                displayGameFeedback(data.mensagem || "Fim da rodada!", "info", 0); // Mensagem persistente
                break;
            case "erro-servidor":
                displayLobbyMessage(`Erro do servidor: ${data.mensagem}. Tente recarregar.`, "error");
                showLobby();
                break;
            default:
                console.warn("Tipo de mensagem não tratada:", data.tipo);
        }
    } catch (error) {
        console.error("Erro ao processar mensagem do servidor:", event.data, error);
    }
};

socket.onclose = () => {
    console.log("Conexão WebSocket fechada.");
    displayLobbyMessage("Conexão perdida. Tente recarregar a página.", "error");
    showLobby();
};

socket.onerror = (error) => {
    console.error("Erro no WebSocket:", error);
    displayLobbyMessage("Erro na conexão WebSocket. Verifique o console e recarregue.", "error");
    showLobby();
};

// --- Inicialização e Event Listeners do Lobby ---
joinGameButton.addEventListener('click', () => {
    const desiredNickname = nicknameInput.value.trim();
    if (desiredNickname.length < 3 || desiredNickname.length > 15) {
        return displayLobbyMessage('Nickname deve ter entre 3 e 15 caracteres.', 'error');
    }
    username = desiredNickname;
    socket.send(JSON.stringify({ tipo: "registrar", jogador: username }));
    displayLobbyMessage('Registrando...', 'info');
    joinGameButton.disabled = true;
    nicknameInput.disabled = true;
});

nicknameInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') joinGameButton.click();
});

// --- Inicialização da UI ---
showLobby(); // Mostra a tela de lobby inicialmente