/* Tree-shaken Three.js build for the "Inside the lab" scene.
   Rebuild: npm i three@0.186.0 esbuild, then
   npx esbuild tools/three-entry.js --bundle --format=esm --minify --legal-comments=eof --target=es2020 --outfile=assets/js/vendor/three.lab.min.js */
export {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, InstancedMesh, Points, LineSegments,
  BufferGeometry, BufferAttribute, InstancedBufferAttribute, LatheGeometry, CylinderGeometry,
  SphereGeometry, PlaneGeometry, TorusGeometry, BoxGeometry, EdgesGeometry, CircleGeometry,
  MeshStandardMaterial, MeshBasicMaterial, ShaderMaterial, LineDashedMaterial, LineBasicMaterial,
  CanvasTexture, Color, Vector2, Vector3, Matrix4, Quaternion, Object3D, Euler,
  PMREMGenerator, SRGBColorSpace, ACESFilmicToneMapping, NeutralToneMapping, DoubleSide, FrontSide, BackSide,
  NormalBlending, AdditiveBlending, MathUtils, DirectionalLight, AmbientLight, HemisphereLight,
  Clock, Timer, LinearFilter, LinearMipmapLinearFilter, ClampToEdgeWrapping, RepeatWrapping
} from "three";
export { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
