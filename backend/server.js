const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const cors = require('cors'); // Importar o módulo CORS

const app = require('express')(); // Usar Express para simplificar o servidor HTTP
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- CONFIGURAÇÃO CORS ---
// Adicione o middleware CORS ao seu aplicativo Express
// '*' permite qualquer origem, o que é útil para depuração,
// mas em produção, é melhor especificar a URL exata do seu frontend.
// Ex: origin: 'https://cryptoword-multiplayer.onrender.com'
app.use(cors({
    origin: '*', // Permite qualquer origem. Para produção, mude para a URL do seu frontend.
    methods: ['GET', 'POST'], // Métodos HTTP permitidos
    credentials: true // Se você usar cookies ou credenciais
}));
// --- FIM CONFIGURAÇÃO CORS ---

// --- SERVIR ARQUIVOS ESTÁTICOS ---
// Use o Express para servir arquivos estáticos de forma mais robusta.
// O 'path.join(__dirname, '/'))' garante que ele servirá arquivos da raiz do repositório
// onde o server.js está.
app.use(express.static(path.join(__dirname, ''))); 

// Adicione uma rota para o index.html, caso alguém acesse a raiz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Tratamento específico para favicon.ico (evita 404 no console)
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'favicon.ico'), (err) => {
        if (err) {
            // Se o favicon não existir, retorne 204 No Content
            res.status(204).end(); 
        }
    });
});

// Remove o código manual de leitura de arquivos que foi substituído pelo express.static
// const server = http.createServer((req, res) => {
//     const filePath = req.url === '/' ? './frontend/index.html' : `./frontend${req.url}`;
//     const ext = path.extname(filePath);
//     const contentTypes = {
//         '.html': 'text/html',
//         '.js': 'text/javascript',
//         '.css': 'text/css',
//     };
//     fs.readFile(filePath, (err, content) => {
//         if (err) {
//             res.writeHead(404);
//             res.end('Arquivo não encontrado');
//         } else {
//             res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
//             res.end(content);
//         }
//     });
// });
// --- FIM SERVIR ARQUIVOS ESTÁTICOS ---


const jogadores = new Map();
const pontuacoes = {};
let currentGrid = [];

const LISTA_MESTRA_PALAVRAS = [
    'BLOCKCHAIN', 'CRYPTO', 'TOKEN', 'NODE', 'BITCOIN',
    'ETHEREUM', 'SOLIDITY', 'SMARTCONTRACT', 'MINING', 'WALLET',
    'HASH', 'ALGORITHM', 'DECENTRALIZED', 'LEDGER', 'TRANSACTION',
    'SATOSHI', 'ALTCOIN', 'FORK', 'STAKING', 'NFT',
    'DAO', 'ORACLE', 'GASFEE', 'LAYER', 'SHARDING',
    'VALIDATOR', 'CONSENSUS', 'MAINNET', 'TESTNET', 'PEER'
];
const NUMERO_DE_PALAVRAS_POR_JOGO = 5;

let palavrasDoJogoAtual = []; // Palavras que devem ser encontradas neste jogo
let palavrasEncontradasNoJogo = new Set(); // Palavras JÁ encontradas neste jogo (para evitar duplicatas)

const MIN_JOGADORES = 2;
let jogoIniciado = false;
let contagemRegressivaInterval = null;

function selecionarPalavrasParaJogo() {
    palavrasDoJogoAtual = [];
    const copiaListaMestra = [...LISTA_MESTRA_PALAVRAS];
    if (copiaListaMestra.length === 0) {
        console.error("ERRO: LISTA_MESTRA_PALAVRAS está vazia!");
        return [];
    }
    let numPalavrasASortear = Math.min(NUMERO_DE_PALAVRAS_POR_JOGO, copiaListaMestra.length);
    
    for (let i = 0; i < numPalavrasASortear; i++) {
        if (copiaListaMestra.length === 0) break;
        const indiceAleatorio = Math.floor(Math.random() * copiaListaMestra.length);
        palavrasDoJogoAtual.push(copiaListaMestra.splice(indiceAleatorio, 1)[0]);
    }
    return palavrasDoJogoAtual;
}

function iniciarNovoJogo() {
    console.log('Iniciando um novo jogo...');
    selecionarPalavrasParaJogo();

    if (palavrasDoJogoAtual.length === 0) {
        console.warn("Nenhuma palavra selecionada para o jogo. Verifique a lista mestra e a configuração.");
        // Opcional: impedir início do jogo ou usar palavras default
    }

    palavrasEncontradasNoJogo.clear(); // Limpa as palavras encontradas de rodadas anteriores
    currentGrid = preencherGridComPalavras(palavrasDoJogoAtual); // Preenche o grid com as palavras selecionadas
    jogoIniciado = true;

    Object.keys(pontuacoes).forEach(jogadorNome => pontuacoes[jogadorNome] = 0);

    broadcast({
        tipo: 'jogo-iniciado',
        grid: currentGrid,
        pontuacoes: pontuacoes,
        jogadores: Array.from(jogadores.values()),
        todasPalavrasJogo: palavrasDoJogoAtual, // Envia a lista completa de palavras do jogo
        palavrasEncontradas: Array.from(palavrasEncontradasNoJogo) // Nenhuma encontrada no início
    });
    console.log('Novo jogo iniciado! Palavras para encontrar:', palavrasDoJogoAtual);
}

function iniciarContagemRegressiva(tempoInicial) {
    let tempoRestante = tempoInicial;
    broadcast({ tipo: 'contagem-regressiva', tempo: tempoRestante });

    if (contagemRegressivaInterval) clearInterval(contagemRegressivaInterval);

    contagemRegressivaInterval = setInterval(() => {
        tempoRestante--;
        broadcast({ tipo: 'contagem-regressiva', tempo: tempoRestante });
        if (tempoRestante <= 0) {
            clearInterval(contagemRegressivaInterval);
            contagemRegressivaInterval = null;
            // Se o jogo não iniciou e há jogadores suficientes, inicia um novo jogo.
            // Se o jogo já iniciou e todas as palavras foram encontradas, inicia uma nova rodada.
            if (!jogoIniciado && jogadores.size >= MIN_JOGADORES) {
                iniciarNovoJogo();
            } else if (jogoIniciado && palavrasEncontradasNoJogo.size === palavrasDoJogoAtual.length) {
                // Todas as palavras foram encontradas, inicia uma nova rodada automaticamente
                broadcast({ tipo: 'fim-de-rodada', mensagem: "Todas as palavras foram encontradas! Iniciando nova rodada..." });
                setTimeout(() => iniciarNovoJogo(), 3000); // Dá um pequeno tempo antes de reiniciar
            } else if (jogoIniciado && palavrasEncontradasNoJogo.size < palavrasDoJogoAtual.length) {
                // Tempo acabou e nem todas as palavras foram encontradas
                broadcast({ tipo: 'fim-de-rodada', mensagem: "Tempo esgotado! Iniciando nova rodada..." });
                setTimeout(() => iniciarNovoJogo(), 3000); // Inicia nova rodada mesmo se não encontrou todas
            }
        }
    }, 1000);
}


function tentarColocarPalavra(grid, palavra, tamanho) {
    const MAX_TENTATIVAS_POSICIONAMENTO = 50; 
    for (let tentativa = 0; tentativa < MAX_TENTATIVAS_POSICIONAMENTO; tentativa++) {
        const direcao = Math.random() < 0.5 ? 'H' : 'V'; // Horizontal ou Vertical
        const x = Math.floor(Math.random() * tamanho);
        const y = Math.floor(Math.random() * tamanho);

        let podeColocar = true;
        const celulasParaPreencher = [];

        if (direcao === 'H' && y + palavra.length <= tamanho) {
            for (let i = 0; i < palavra.length; i++) {
                if (grid[x][y + i] !== '' && grid[x][y + i] !== palavra[i]) {
                    podeColocar = false; break;
                }
                celulasParaPreencher.push({ x, y: y + i, letra: palavra[i] });
            }
        } else if (direcao === 'V' && x + palavra.length <= tamanho) {
            for (let i = 0; i < palavra.length; i++) {
                if (grid[x + i][y] !== '' && grid[x + i][y] !== palavra[i]) {
                    podeColocar = false; break;
                }
                celulasParaPreencher.push({ x: x + i, y, letra: palavra[i] });
            }
        } else {
            podeColocar = false;
        }

        if (podeColocar) {
            celulasParaPreencher.forEach(cell => grid[cell.x][cell.y] = cell.letra);
            return true;
        }
    }
    return false;
}

function preencherGridComPalavras(palavras) {
    const LETRAS_ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const TAMANHO_GRID = 12;
    let grid = Array.from({ length: TAMANHO_GRID }, () => Array(TAMANHO_GRID).fill(''));

    palavras.forEach(palavra => {
        if (!tentarColocarPalavra(grid, palavra, TAMANHO_GRID)) {
            console.warn(`Não foi possível colocar a palavra "${palavra}" no grid.`);
        }
    });

    for (let i = 0; i < TAMANHO_GRID; i++) {
        for (let j = 0; j < TAMANHO_GRID; j++) {
            if (grid[i][j] === '') {
                grid[i][j] = LETRAS_ALFABETO[Math.floor(Math.random() * LETRAS_ALFABETO.length)];
            }
        }
    }
    return grid;
}


function acharCoordenadasPalavra(palavra, grid) {
    const coordenadasEncontradas = [];
    const tamanho = grid.length;

    for (let r = 0; r < tamanho; r++) {
        for (let c = 0; c < tamanho; c++) {
            // Horizontal
            if (c + palavra.length <= tamanho) {
                let subArrayH = grid[r].slice(c, c + palavra.length).join('');
                if (subArrayH === palavra) {
                    const coords = [];
                    for (let k = 0; k < palavra.length; k++) coords.push([r, c + k]);
                    coordenadasEncontradas.push(coords);
                }
            }
            // Vertical
            if (r + palavra.length <= tamanho) {
                let subArrayV = '';
                for (let k = 0; k < palavra.length; k++) subArrayV += grid[r + k][c];
                if (subArrayV === palavra) {
                    const coords = [];
                    for (let k = 0; k < palavra.length; k++) coords.push([r + k, c]);
                    coordenadasEncontradas.push(coords);
                }
            }
        }
    }
    return coordenadasEncontradas;
}

function verificarPalavra(jogadorNome, palavraEnviada, ws) {
    if (!jogoIniciado) {
        return ws.send(JSON.stringify({ tipo: 'palavra-errada', mensagem: 'O jogo ainda não começou.' }));
    }

    const palavraUpper = palavraEnviada.toUpperCase();

    if (!palavrasDoJogoAtual.includes(palavraUpper)) {
        return ws.send(JSON.stringify({ tipo: 'palavra-errada', mensagem: 'Esta palavra não faz parte do jogo atual.' }));
    }

    if (palavrasEncontradasNoJogo.has(palavraUpper)) {
        return ws.send(JSON.stringify({ tipo: 'palavra-errada', mensagem: 'Esta palavra já foi encontrada!' }));
    }

    const coords = acharCoordenadasPalavra(palavraUpper, currentGrid);

    if (coords.length > 0) {
        palavrasEncontradasNoJogo.add(palavraUpper);
        pontuacoes[jogadorNome] = (pontuacoes[jogadorNome] || 0) + 10;

        broadcast({
            tipo: 'palavra-certa',
            palavra: palavraUpper,
            coordenadas: coords[0], // Envia apenas o primeiro conjunto de coordenadas se houver múltiplos
            jogador: jogadorNome,
            pontuacoes: pontuacoes,
            palavrasEncontradas: Array.from(palavrasEncontradasNoJogo) // Envia a lista atualizada
        });

        // Verifica se todas as palavras foram encontradas
        if (palavrasEncontradasNoJogo.size === palavrasDoJogoAtual.length) {
            broadcast({ tipo: 'fim-de-rodada', mensagem: "Todas as palavras foram encontradas! Iniciando nova rodada em 5 segundos." });
            // Inicia uma nova contagem regressiva para a próxima rodada
            setTimeout(() => iniciarContagemRegressiva(5), 3000); 
        }
    } else {
        ws.send(JSON.stringify({ tipo: 'palavra-errada', mensagem: 'Palavra não encontrada no grid ou caminho inválido.' }));
    }
}


// Função para enviar uma mensagem para todos os clientes conectados
function broadcast(message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Lógica de conexão WebSocket
wss.on('connection', ws => {
    console.log('Cliente conectado!');

    // Envia o estado atual do lobby para o novo cliente
    ws.send(JSON.stringify({
        tipo: 'lobby-update',
        jogadoresConectados: jogadores.size,
        minJogadores: MIN_JOGADORES,
        jogoIniciado: jogoIniciado,
        jogadores: Array.from(jogadores.values()),
        pontuacoes: pontuacoes
    }));

    ws.on('message', message => {
        const data = JSON.parse(message);
        console.log('Mensagem recebida do cliente:', data);

        switch (data.tipo) {
            case 'registrar':
                const jogador = data.jogador.trim();
                if (jogador.length < 3 || jogador.length > 15) {
                    return ws.send(JSON.stringify({ tipo: 'erro-registro', mensagem: 'Nickname deve ter entre 3 e 15 caracteres.' }));
                }
                if (Array.from(jogadores.values()).includes(jogador)) {
                    return ws.send(JSON.stringify({ tipo: 'erro-registro', mensagem: 'Nickname já em uso.' }));
                }
                jogadores.set(ws, jogador);
                pontuacoes[jogador] = 0;
                ws.send(JSON.stringify({ tipo: 'registrado', jogador: jogador }));
                
                broadcast({
                    tipo: 'lobby-update',
                    mensagem: `${jogador} entrou no lobby.`,
                    jogadoresConectados: jogadores.size,
                    minJogadores: MIN_JOGADORES,
                    jogoIniciado: jogoIniciado,
                    jogadores: Array.from(jogadores.values()),
                    pontuacoes: pontuacoes
                });

                if (!jogoIniciado && jogadores.size >= MIN_JOGADORES) {
                    iniciarContagemRegressiva(5); // Inicia contagem regressiva para o jogo
                }
                break;
            case 'palavra':
                const jogadorAtual = jogadores.get(ws);
                if (jogadorAtual) {
                    verificarPalavra(jogadorAtual, data.palavra, ws);
                }
                break;
            case 'sair-sala': // Handle "leave room" message
                const leavingPlayer = jogadores.get(ws);
                if (leavingPlayer) {
                    jogadores.delete(ws);
                    delete pontuacoes[leavingPlayer];
                    console.log(`${leavingPlayer} saiu da sala.`);
                    broadcast({
                        tipo: 'lobby-update',
                        mensagem: `${leavingPlayer} saiu do jogo.`,
                        jogadoresConectados: jogadores.size,
                        minJogadores: MIN_JOGADORES,
                        jogoIniciado: jogoIniciado,
                        jogadores: Array.from(jogadores.values()),
                        pontuacoes: pontuacoes
                    });

                    // If a game is in progress and players drop below minimum, reset game state
                    if (jogoIniciado && jogadores.size < MIN_JOGADORES) {
                        console.log("Número insuficiente de jogadores. Reiniciando lobby.");
                        jogoIniciado = false;
                        if (contagemRegressivaInterval) {
                            clearInterval(contagemRegressivaInterval);
                            contagemRegressivaInterval = null;
                        }
                        // Notify clients that the game has ended due to insufficient players
                        broadcast({
                            tipo: 'fim-de-rodada',
                            mensagem: "Número insuficiente de jogadores. Jogo pausado. Aguardando mais jogadores."
                        });
                        // Optionally, if you want players to automatically return to lobby:
                        // broadcast({ tipo: 'voltar-lobby' }); // You'd need to handle this type on client
                    }
                }
                break;
            default:
                console.warn('Tipo de mensagem desconhecido:', data.tipo);
        }
    });

    ws.on('close', () => {
        const jogadorDesconectado = jogadores.get(ws);
        if (jogadorDesconectado) {
            jogadores.delete(ws);
            delete pontuacoes[jogadorDesconectado];
            console.log(`${jogadorDesconectado} desconectado.`);
            broadcast({
                tipo: 'lobby-update',
                mensagem: `${jogadorDesconectado} saiu do jogo.`,
                jogadoresConectados: jogadores.size,
                minJogadores: MIN_JOGADORES,
                jogoIniciado: jogoIniciado,
                jogadores: Array.from(jogadores.values()),
                pontuacoes: pontuacoes
            });

            if (jogoIniciado && jogadores.size < MIN_JOGADORES) {
                console.log("Número insuficiente de jogadores. Reiniciando lobby.");
                jogoIniciado = false;
                if (contagemRegressivaInterval) {
                    clearInterval(contagemRegressivaInterval);
                    contagemRegressivaInterval = null;
                }
                broadcast({
                    tipo: 'fim-de-rodada',
                    mensagem: "Número insuficiente de jogadores. Jogo pausado. Aguardando mais jogadores."
                });
            }
        } else {
            console.log('Cliente desconectado (não registrado).');
        }
    });

    ws.on('error', error => {
        console.error('Erro no WebSocket:', error);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse http://localhost:${PORT}`);
});