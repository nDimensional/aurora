import { assert } from "../utils.js";

export class SquareRenderer {
	public static vertexBufferLayout: GPUVertexBufferLayout = {
		arrayStride: 2 * 4,
		stepMode: "vertex",
		attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
	};

	public static indexBufferData = new Uint16Array([0, 1, 2, 2, 0, 3]);

	// prettier-ignore
	public static vertexBufferData = new Float32Array([
	  [-1.0,  1.0],
		[ 1.0,  1.0],
		[ 1.0, -1.0],
		[-1.0, -1.0],
	].flat());

	vertexBuffer: GPUBuffer;
	indexBuffer: GPUBuffer;

	protected constructor(readonly device: GPUDevice) {
		// initialize vertex buffer
		const vertexBufferSize = SquareRenderer.vertexBufferData.length * 4;
		this.vertexBuffer = device.createBuffer({
			label: "vertexBuffer",
			usage: GPUBufferUsage.VERTEX,
			mappedAtCreation: true,
			size: vertexBufferSize,
		});

		const vertexMap = this.vertexBuffer.getMappedRange(0, vertexBufferSize);
		new Float32Array(vertexMap, 0, SquareRenderer.vertexBufferData.length).set(SquareRenderer.vertexBufferData);
		this.vertexBuffer.unmap();

		// initialize index buffer
		const indexBufferSize = SquareRenderer.indexBufferData.length * 2;
		this.indexBuffer = device.createBuffer({
			label: "indexBuffer",
			usage: GPUBufferUsage.INDEX,
			mappedAtCreation: true,
			size: indexBufferSize,
		});

		const indexMap = this.indexBuffer.getMappedRange(0, indexBufferSize);
		new Uint16Array(indexMap, 0, SquareRenderer.indexBufferData.length).set(SquareRenderer.indexBufferData);
		this.indexBuffer.unmap();
	}

	protected createStorageBuffer(label: string, byteLength: number, data?: ArrayBufferView) {
		if (data) {
			assert(data.byteLength === byteLength);
		}

		const buffer = this.device.createBuffer({
			label: label,
			size: byteLength,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
			// usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
			mappedAtCreation: !!data,
		});

		if (data) {
			const source = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
			const target = new Uint8Array(buffer.getMappedRange());
			target.set(source);
			buffer.unmap();
		}

		return buffer;
	}
}
