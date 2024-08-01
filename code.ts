// Constants
const confirmMsgs = ['Done!', 'You got it!', 'Aye!', 'Is that all?', 'My job here is done.', 'Gotcha!', 'It wasn\'t hard.', 'Got it! What\'s next?']
const renameMsgs = ['Cleaned', 'Affected', 'Made it with', 'Fixed']
const idleMsgs = ['All great, already', 'Nothing to do, everything\'s good', 'Any layers to affect ? Can\'t see it', 'Nothing to do, your layers are great']
const operations = ['Auto layout', 'Frame', 'Group', 'Rotate', 'Mirror']
const axises = ['Horizontal', 'Vertical']
const angles = ['30', '45', '60', '90', '180']
const groupOps = ['autolayout', 'frame', 'group']
const alignSides = { left: '←  Left', hcenter: '↔ Horizontal Center', right: '→  Right', top: '↑  Top', vcenter: '↕  Vertical Center', bottom: '↓  Bottom', random: '🔀  Random' }

// Variables
let notification: NotificationHandler
let selection: ReadonlyArray<SceneNode>
let newSelection: Array<SceneNode> = []
let working: boolean
let count: number = 0

figma.on('currentpagechange', cancel)

// Main + Elements Check
// post('started')
console.log(`Started`)
working = true
selection = figma.currentPage.selection

// Suggestions
figma.parameters.on(
  'input',
  ({ key, query, result }: ParameterInputEvent) => {
    switch (key) {
      case 'axis':
        result.setSuggestions(includes(axises, query))
        break
      case 'side':
        result.setSuggestions(includes(Object.values(alignSides), query))
        break
      case 'angle':
        if (!Number.isFinite(Number(query)))
          result.setError('Type any number')
        const suggestions = angles.indexOf(query) >= 0 ? [query, ...angles] : angles
        result.setSuggestions(suggestions.filter(s => s.includes(query)))
        break
      default:
        return
    }
  }
)

function includes(array: string[], value: string) {
  return array.map(el => el).filter(el => el.toLowerCase().includes(value.toLowerCase()))
}

// Anything selected?
figma.on('run', ({ command, parameters }: RunEvent) => {
  if (selection.length)
    for (const node of selection)
      each(node, command, parameters)
  figma.currentPage.selection = newSelection.length > 0 ? newSelection : selection
  finish()
})

// Action for selected nodes
function each(node: SceneNode, command, parameters) {
  console.log(`Running each for ${node.name}`)
  console.log(`Command ${command}`)
  console.log(`Parameters ${JSON.stringify(parameters)}`)
  switch (command) {
    case 'autolayout':
      const al: FrameNode = figma.createFrame()
      al.x = node.x
      al.y = node.y
      al.layoutMode = 'HORIZONTAL'
      al.appendChild(node)
      al.primaryAxisSizingMode = 'AUTO'
      al.counterAxisSizingMode = 'AUTO'
      newSelection.push(al)
      break

    case 'frame':
      const frame: FrameNode = figma.createFrame()
      frame.x = node.x
      frame.y = node.y
      frame.appendChild(node)
      frame.resize(node.width, node.height)
      node.x = node.y = 0
      newSelection.push(frame)
      break

    case 'group':
      const group = figma.group([node], node.parent ? node.parent : figma.currentPage)
      newSelection.push(group)
      break

    case 'component':
      const component: ComponentNode = figma.createComponent()
      component.x = node.x
      component.y = node.y
      component.appendChild(node)
      component.resize(node.width, node.height)
      node.x = node.y = 0
      newSelection.push(component)
      break

    case 'flatten':
      recursiveDetach(node)
      figma.flatten([node], node.parent ? node.parent : figma.currentPage)
      break

    case 'flip':
      const horMatrix: Transform = [
        [-1, 0, node.x + node.width],
        [0, 1, node.y]]
      const verMatrix: Transform = [
        [1, 0, node.x],
        [0, -1, node.y + node.height]]
      const newTransform = parameters.axis === 'Horizontal' ? horMatrix : verMatrix
      node.relativeTransform = matrixMultiply(node.relativeTransform as Transform, newTransform as Transform)
      break

    case 'rotate':
      const rad = Number(parameters.angle) * Math.PI / 180
      node.relativeTransform =
        [[Math.cos(rad), Math.sin(rad), 0],
        [-Math.sin(rad), Math.cos(rad), 0]]
      break

    case 'align':
      console.log(`Called "align"`)
      console.log(`Parent has type: ${node.parent?.type || ''}`)

      if (!['FRAME', 'COMPONENT', 'SECTION'].includes(node.parent?.type || '')) {
        notify(`Node can't be aligned to this parent`)
        break
      }

      const hasContstraints = (node.parent && node.parent.type === 'FRAME' && 'constraints' in node)
      console.log(`Has contstraints: ${hasContstraints}`)
      const parent = node.parent as FrameNode | ComponentNode | SectionNode
      console.log(`Parent: ${parent}`)

      console.log(`Side: ${parameters.side}`)
      switch (parameters.side) {
        case alignSides.left:
          console.log('Aligning left')
          node.x = 0
          if (hasContstraints)
            node.constraints = { horizontal: 'MIN', vertical: node.constraints.vertical }
          break
        case alignSides.hcenter:
          node.x = Math.round(parent.width / 2 - node.width / 2)
          if (hasContstraints)
            node.constraints = { horizontal: 'CENTER', vertical: node.constraints.vertical }
          break
        case alignSides.right:
          node.x = Math.round(parent.width - node.width)
          if (hasContstraints)
            node.constraints = { horizontal: 'MAX', vertical: node.constraints.vertical }
          break
        case alignSides.top:
          node.y = 0
          if (hasContstraints)
            node.constraints = { horizontal: node.constraints.horizontal, vertical: 'MIN' }
          break
        case alignSides.vcenter:
          node.y = Math.round(parent.height / 2 - node.height / 2)
          if (hasContstraints)
            node.constraints = { horizontal: node.constraints.horizontal, vertical: 'CENTER' }
          break
        case alignSides.bottom:
          node.y = Math.round(parent.height - node.height)
          if (hasContstraints)
            node.constraints = { horizontal: node.constraints.horizontal, vertical: 'MAX' }
          break
        case alignSides.random:
          node.x = Math.random() * (parent.width - node.width)
          node.y = Math.random() * (parent.height - node.height)
          break
      }
      break

    case 'request':
      figma.ui.postMessage({ request: parameters.request })
  }
  count++
}


function matrixMultiply(m1: Transform, m2: Transform) {
  console.log(m1)
  console.log(m2)
  let res: any[] = []
  for (let i = 0; i < m1.length; i++) {
    res[i] = []
    for (let j = 0; j < m2[0].length; j++) {
      let sum = 0
      for (let k = 0; k < m1[0].length; k++) {
        sum += m1[i][k] * m2[k][j]
      }
      res[i][j] = sum
    }
  }
  return res as Transform;
}

// function matrixMultiply(A, B) {
//   let result = new Array(A.length).fill(0).map(row => new Array(B[0].length).fill(0))
//   return result.map((row, i) => {
//     return row.map((val, j) => {
//       return A[i].reduce((sum, elm, k) => sum + (elm * B[k][j]), 0)
//     })
//   }) as Transform
// }

function recursiveDetach(node: SceneNode) {
  if (node.type === 'INSTANCE') node.detachInstance()
  if ('children' in node) {
    for (const child of node.children) {
      recursiveDetach(child)
    }
  }
}

// Ending the work
function finish() {
  working = false
  if (count > 0) {
    notify(confirmMsgs[Math.floor(Math.random() * confirmMsgs.length)] +
      ' ' + renameMsgs[Math.floor(Math.random() * renameMsgs.length)] +
      ' ' + ((count === 1) ? 'only one layer' : (count + ' layers')))

  }
  else notify(idleMsgs[Math.floor(Math.random() * idleMsgs.length)])
  setTimeout(() => figma.closePlugin(), 3000)
}

// Show new notification
function notify(text: string) {
  if (notification != null)
    notification.cancel()
  notification = figma.notify(text)
}

// Showing interruption notification
function cancel() {
  if (notification != null)
    notification.cancel()
  if (working) {
    notify('Plugin work have been interrupted')
  }
}