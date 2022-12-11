// Constants
const confirmMsgs = ['Done!', 'You got it!', 'Aye!', 'Is that all?', 'My job here is done.', 'Gotcha!', 'It wasn\'t hard.', 'Got it! What\'s next?']
const renameMsgs = ['Cleaned', 'Affected', 'Made it with', 'Fixed']
const idleMsgs = ['All great, already', 'Nothing to do, everything\'s good', 'Any layers to affect ? Can\'t see it', 'Nothing to do, your layers are great']
const operations = ['Auto layout', 'Frame', 'Group', 'Rotate', 'Mirror']
const axises = ['Horizontal', 'Vertical']
const angles = ['30', '45', '60', '90', '180']
const groupOps = ['autolayout', 'frame', 'group']

// Variables
let notification: NotificationHandler
let selection: ReadonlyArray<SceneNode>
let newSelection: Array<SceneNode> = []
let working: boolean
let count: number = 0

figma.on('currentpagechange', cancel)

// For networking purposes
figma.showUI(__html__, { visible: false })
const post = (k, v = 1, last = false, plugin = 'each') => figma.ui.postMessage({ k: k, v: v, last: last, plugin: plugin })
figma.ui.onmessage = async (msg) => {
  if (msg === 'finished') // Real plugin finish (after server's last response)
    figma.closePlugin()
  else
    console.log(msg)
}

// Main + Elements Check
post('started')
working = true
const start = Date.now()
selection = figma.currentPage.selection

// Suggestions
figma.parameters.on(
  'input',
  ({ key, query, result }: ParameterInputEvent) => {
    switch (key) {
      case 'axis':
        result.setSuggestions(axises.filter(s => s.includes(query)))
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

// Anything selected?
figma.on('run', ({ command, parameters }: RunEvent) => {
  if (selection.length)
    for (const node of selection)
      each(node, command, parameters)
  figma.currentPage.selection = newSelection
  switch (command) {
    case 'autolayout': post('autolayouted', count)
    case 'frame': post('framed', count)
    case 'group': post('grouped', count)
    case 'component': post('made', count)
    case 'flatten': post('flattened', count)
  }
  finish()
})

// Action for selected nodes
function each(node: SceneNode, command, parameters) {
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
      newSelection.push(node)
      break
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
    post('processed', count)
    const time = (Date.now() - start) / 1000
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