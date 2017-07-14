import * as WebSocket from "ws";

export type messageListener = (message: string) => void;
export type chatMessageListener = (userId: number, userName: string, message: string) => void;

interface OutcomingPacket {
	Name: string;
	Identifier: number;
	Message: string;
}

interface IncomingPacket {
	Type: "Generic" | "Chat";
	Identifier: number;
	Message: string;
	Stacktrace: string;
}

interface ChatMessage {
	UserId: number;
	Username: string;
	Message: string;
	Color: string;
	Time: number;
}

export default class Rcon {
	private name: string;
	private hostname: string;
	private port: number;
	private password: string;

	private socket: WebSocket;
	private connection: Promise<void>;
	private timer: NodeJS.Timer;

	private id: number = 1;
	private commands: {[id: number]: (value: any) => void} = {};

	private messageListener: messageListener;
	private chatMessageListener: chatMessageListener;

	constructor(name: string, hostname: string, port: number, password: string, messageListener: messageListener, chatMessageListener: chatMessageListener) {
		this.name = name;
		this.hostname = hostname;
		this.port = port;
		this.password = password;

		this.messageListener = messageListener;
		this.chatMessageListener = chatMessageListener;

		this.connect().catch(() => {
			//
		});
	}

	public sendCommand(command: string): Promise<any> {
		return this.connect().then(() => {
			const id = this.id++;

			const message: OutcomingPacket = {
				Name: this.name,
				Identifier: id,
				Message: command,
			};

			this.socket.send(JSON.stringify(message));

			return new Promise((resolve, reject) => {
				this.commands[id] = (value) => {
					resolve(value);
					delete this.commands[id];
				};

				setTimeout(() => {
					reject();
					delete this.commands[id];
				}, 1000);
			});
		});
	}

	private get url(): string {
		return `ws://${this.hostname}:${this.port}/${this.password}`;
	}

	private get signature(): string {
		return `${this.name} [${this.url}]`;
	}

	// private log(message: string): void {
	// 	console.log(`${this.signature}: ${message}`);
	// }

	private connect(): Promise<void> {
		clearTimeout(this.timer);

		if (!this.connection) {
			this.connection = new Promise((resolve, reject) => {
				// this.log("connecting");

				this.socket = new WebSocket(this.url);

				this.socket.addEventListener("open", (event) => {
					// this.log("connected");

					resolve();
				});

				this.socket.addEventListener("close", (event) => {
					// this.log("disconnected");

					reject();
					this.connection = null;

					this.timer = setTimeout(() => {
						this.connect().catch(() => {
							//
						});
					}, 5000);
				});

				this.socket.addEventListener("message", (event) => {
					const data: IncomingPacket = JSON.parse(event.data);

					if (data.Identifier === -1) {
						if ((data.Type === "Chat") && this.chatMessageListener) {
							const message: ChatMessage = JSON.parse(data.Message);

							this.chatMessageListener(message.UserId, message.Username, message.Message);
						}
					} else if (data.Identifier === 0) {
						if (this.messageListener) {
							this.messageListener(data.Message);
						}
					} else if (this.commands[data.Identifier]) {
						this.commands[data.Identifier](data.Message);
					}
				});
			});
		}

		return this.connection;
	}
}
