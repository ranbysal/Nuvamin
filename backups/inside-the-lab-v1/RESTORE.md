# Backup: "Inside the lab" v1 (Plate Series)

The original homepage section 03: a pinned GSAP photo sequence using the four
photographs in `assets/img/lab/`. It was replaced by the 3D "life of a lot"
scene (`assets/js/lab3d.js`).

The exact site at the time of the swap is also on the git branch
`backup/inside-the-lab-plate-series`.

## Restore

1. In `index.html`, replace the `<!-- ============ INSIDE THE LAB ============ -->`
   section with the contents of `section.html`.
2. In `assets/css/style.css`, replace the `inside the lab: 3D "life of a lot"`
   block with the contents of `lab-sequence.css`.
3. Move `lab-sequence.js` back to `assets/js/lab-sequence.js`, and in
   `index.html` replace the `lab3d.js` script tag with:

   ```html
   <script defer src="assets/js/lab-sequence.js"></script>
   ```

   (keep the two GSAP vendor scripts above it).
